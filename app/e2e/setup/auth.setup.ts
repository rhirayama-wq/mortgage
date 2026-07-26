/**
 * Playwright `auth-setup` project — 認証済み E2E 基盤のセットアップ。
 * FICTIONAL / LOCAL ONLY / PRODUCTION USE PROHIBITED（CLAUDE.md §32）
 *
 * 役割（業務テストからは完全に分離する）:
 *  1. ローカル Supabase に架空の法人 A/B と架空ユーザーを冪等に用意する
 *     （公開業務関数 app_create_organization / app_invite_organization_member /
 *      app_accept_invitation / app_suspend_member / app_end_membership のみを使用。
 *      RLS・GRANT・migration は一切変更しない）
 *  2. 各 fixture の認証済みセッションを **アプリの実 /auth/callback 経路** で取得し、
 *     実 Cookie を storageState として app/.auth/<key>.json に保存する
 *  3. 法人 ID / membership ID を app/.auth/fixtures.json へ書き出す
 *
 * セキュリティ:
 *  - token_hash / Cookie / anon key / service role key / Magic Link URL はログへ出さない
 *  - 失敗時は必ず throw して FAIL させる（古い storageState を黙って使い回さない）
 *  - 実行のたびに app/.auth を作り直す（stale session を使わない）
 *  - Magic Link は GoTrue Admin API の generateLink のみ（メール送信経路は使わない）
 */

import { mkdirSync, rmSync } from "node:fs";
import { test as setup, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assertLoopback,
  describeError,
  describePostgrestError,
  loadDotEnvLocal,
  requireEnv,
} from "../fixtures/env";
import {
  AUTH_STATE_DIR,
  FIXTURES,
  ORG_A_NAME,
  ORG_B_NAME,
  SEEDED_SYSTEM_ADMIN_EMAIL,
  storageStatePath,
  type FixtureIdentity,
  type FixtureKey,
  type OrgKey,
} from "../fixtures/identities";
import { writeFixtureManifest } from "../fixtures/manifest";

const hasLocalSupabase = !!process.env.E2E_SUPABASE_LOCAL;

setup.skip(
  !hasLocalSupabase,
  "E2E_SUPABASE_LOCAL is not set — 認証済み E2E 基盤は SUPABASE_PENDING",
);

const NOAUTH = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

/** GoTrue Admin API で magic link を発行し token_hash を返す（メールは送信しない）。 */
async function magicTokenHash(admin: SupabaseClient, email: string): Promise<string> {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hash = link.data?.properties?.hashed_token;
  if (link.error || !hash) {
    throw new Error(
      `generateLink failed for fixture <${email}>: ${describeError(link.error)}`,
    );
  }
  // token_hash は返すだけ。呼び出し側もログへ出さない。
  return hash;
}

/** seed 済み SYSTEM_ADMIN の supabase-js セッション（password は設定できないため magic link）。 */
async function createSysadminClient(
  url: string,
  anonKey: string,
  admin: SupabaseClient,
): Promise<SupabaseClient> {
  const hash = await magicTokenHash(admin, SEEDED_SYSTEM_ADMIN_EMAIL);
  const client = createClient(url, anonKey, NOAUTH);
  let verified = await client.auth.verifyOtp({ type: "email", token_hash: hash });
  if (verified.error) {
    verified = await client.auth.verifyOtp({ type: "magiclink", token_hash: hash });
  }
  if (verified.error || !verified.data.session) {
    throw new Error(
      `seeded SYSTEM_ADMIN session could not be established: ${describeError(verified.error)}`,
    );
  }
  return client;
}

/** 架空ユーザーを冪等に用意する（password は設定しない）。 */
async function ensureAuthUser(admin: SupabaseClient, email: string): Promise<string> {
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (!created.error && created.data.user) return created.data.user.id;

  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${describeError(error)}`);
  const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
  if (!found) {
    throw new Error(
      `fixture user <${email}> could not be created or found: ${describeError(created.error)}`,
    );
  }
  return found.id;
}

/** 架空法人を冪等に用意する（同名があれば再利用）。 */
async function ensureOrganization(sysadmin: SupabaseClient, name: string): Promise<string> {
  const existing = await sysadmin.from("organizations").select("id").eq("name", name).limit(1);
  const hit = existing.data?.[0]?.id;
  if (!existing.error && typeof hit === "string") return hit;

  const created = await sysadmin.rpc("app_create_organization", { p_name: name });
  if (created.error || typeof created.data !== "string") {
    throw new Error(
      `app_create_organization failed for "${name}": ${describePostgrestError(created.error)}`,
    );
  }
  return created.data;
}

/** membership を冪等に用意する（無ければ invited を作る）。 */
async function ensureMembership(
  sysadmin: SupabaseClient,
  organizationId: string,
  userId: string,
  email: string,
  role: string,
): Promise<string> {
  const existing = await sysadmin
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .limit(1);
  const hit = existing.data?.[0]?.id;
  if (!existing.error && typeof hit === "string") return hit;

  const invited = await sysadmin.rpc("app_invite_organization_member", {
    p_organization_id: organizationId,
    p_email: email,
    p_role: role,
  });
  if (invited.error || typeof invited.data !== "string") {
    throw new Error(
      `app_invite_organization_member failed for <${email}>: ${describePostgrestError(invited.error)}`,
    );
  }
  return invited.data;
}

async function readMembership(
  sysadmin: SupabaseClient,
  membershipId: string,
): Promise<{ role: string; status: string }> {
  const { data, error } = await sysadmin
    .from("organization_memberships")
    .select("role, status")
    .eq("id", membershipId)
    .limit(1);
  const row = data?.[0];
  if (error || !row) {
    throw new Error(
      `membership ${membershipId} could not be read back: ${describePostgrestError(error)}`,
    );
  }
  return { role: String(row.role), status: String(row.status) };
}

/** アプリの実 /auth/callback 経路でブラウザに実 Cookie を持たせる。 */
async function signInBrowser(
  browser: Browser,
  admin: SupabaseClient,
  fixture: FixtureIdentity,
): Promise<{ context: BrowserContext; page: Page }> {
  const hash = await magicTokenHash(admin, fixture.email);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/auth/callback?token_hash=${encodeURIComponent(hash)}&type=email`);
  await page.waitForLoadState("domcontentloaded");

  const landed = new URL(page.url()).pathname;
  if (landed.startsWith("/login")) {
    await context.close();
    throw new Error(
      `magic link callback did not authenticate fixture "${fixture.key}" (landed on /login)`,
    );
  }
  return { context, page };
}

/** 実 UI（Server Action）で招待を受諾する。既に受諾済みなら何もしない（冪等）。 */
async function acceptInvitationViaUi(page: Page, fixture: FixtureIdentity): Promise<void> {
  await page.goto("/pending-invitation");
  await page.waitForLoadState("domcontentloaded");
  if (new URL(page.url()).pathname !== "/pending-invitation") return; // 既に active / 招待なし

  await page.getByRole("button", { name: "招待を受諾" }).first().click();
  await page.waitForURL((u) => u.pathname !== "/pending-invitation" || u.search.includes("e=1"));

  const after = new URL(page.url());
  if (after.pathname === "/pending-invitation" && after.search.includes("e=1")) {
    throw new Error(`invitation acceptance failed for fixture "${fixture.key}"`);
  }
}

setup("認証済み E2E フィクスチャを構築し storageState を生成する", async ({ browser }) => {
  setup.setTimeout(240_000);

  loadDotEnvLocal();
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  assertLoopback(url);
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  // 古い storageState を必ず捨てる（stale session を使わない）
  rmSync(AUTH_STATE_DIR, { recursive: true, force: true });
  mkdirSync(AUTH_STATE_DIR, { recursive: true });

  const admin = createClient(url, serviceKey, NOAUTH);
  const sysadmin = await createSysadminClient(url, anonKey, admin);

  // --- 法人 ---------------------------------------------------------------
  const organizationIds: Record<OrgKey, string> = {
    A: await ensureOrganization(sysadmin, ORG_A_NAME),
    B: await ensureOrganization(sysadmin, ORG_B_NAME),
  };

  // --- ユーザー + membership（invited まで） -------------------------------
  const membershipIds: Partial<Record<FixtureKey, string>> = {};
  for (const fixture of FIXTURES) {
    const userId = fixture.seeded
      ? undefined
      : await ensureAuthUser(admin, fixture.email);
    if (fixture.state === "none" || !fixture.org || !fixture.orgRole || !userId) continue;
    membershipIds[fixture.key] = await ensureMembership(
      sysadmin,
      organizationIds[fixture.org],
      userId,
      fixture.email,
      fixture.orgRole,
    );
  }

  // --- セッション生成 + 受諾（実 HTTP / 実 Cookie） ------------------------
  for (const fixture of FIXTURES) {
    if (!fixture.needsSession) continue;
    const { context, page } = await signInBrowser(browser, admin, fixture);
    try {
      if (fixture.state === "active" || fixture.state === "suspended" || fixture.state === "left") {
        await acceptInvitationViaUi(page, fixture);
      }
      await context.storageState({ path: storageStatePath(fixture.key) });
    } finally {
      await context.close();
    }
    console.log(`  storageState ready: ${fixture.key}`);
  }

  // --- 状態遷移（suspended / left） ---------------------------------------
  for (const fixture of FIXTURES) {
    const membershipId = membershipIds[fixture.key];
    if (!membershipId) continue;
    if (fixture.state === "suspended") {
      // 既に suspended の再実行では membership_invalid_transition になる（許容し最終検証で担保）
      await sysadmin.rpc("app_suspend_member", { p_membership_id: membershipId });
    } else if (fixture.state === "left") {
      await sysadmin.rpc("app_end_membership", { p_membership_id: membershipId });
    }
  }

  // --- 最終状態の検証（期待どおりでなければ FAIL） --------------------------
  for (const fixture of FIXTURES) {
    const membershipId = membershipIds[fixture.key];
    if (!membershipId) continue;
    const actual = await readMembership(sysadmin, membershipId);
    if (actual.status !== fixture.state || actual.role !== fixture.orgRole) {
      throw new Error(
        `fixture "${fixture.key}" is not in the expected state: ` +
          `expected role=${fixture.orgRole} status=${fixture.state}, ` +
          `actual role=${actual.role} status=${actual.status}`,
      );
    }
  }

  writeFixtureManifest({
    organizationIds,
    organizationNames: { A: ORG_A_NAME, B: ORG_B_NAME },
    membershipIds,
  });

  console.log(
    `  e2e auth fixtures ready: orgs=2 users=${FIXTURES.length} (fictional @example.test only)`,
  );
});
