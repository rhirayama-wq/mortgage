/**
 * verify-supabase.ts — 実ローカル Supabase 検証（Phase 1B / B1..B5, B9, B13-DB, B15）
 *
 * 目的:
 *   PostgreSQL ハーネス (test:db) では代替できない、実 Supabase スタックの挙動を
 *   PostgREST / GoTrue / service_role 経由で検証する。
 *     B1  auth.users 作成トリガー → user_profiles 自動作成・email 小文字ミラー
 *     B2  PostgREST 経由の RLS（テナント越境不可・自分の行のみ）
 *     B3  列 GRANT（display_name のみ更新可・email / system_role 更新不可）
 *     B4  anon / authenticated / service_role の実挙動差
 *     B5    業務 RPC の認可・監査（SALES 越権拒否・監査可視性）
 *     B9    招待先メール一致（他人は A の membership を accept 不可・状態/監査不変）
 *     B13-DB 失敗監査の別Tx経路（DB/PostgREST・service_role・correlation・SEC-83 / 86）
 *            ※ Next.js 実 HTTP 経路（B13-HTTP）は未実装・PENDING
 *     B15   SEC の PostgREST 再確認（直接 INSERT/UPDATE/DELETE 拒否・監査保護）
 *
 * 実行（Mac 側・Docker + supabase start 済み）:
 *   cd app && npm run verify:supabase
 *
 * 前提:
 *   - `supabase db reset` 済み（seed.sql が sysadmin.fictional@example.test を
 *     SYSTEM_ADMIN としてブートストラップしている）。
 *   - `.env.local` に NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
 *     SUPABASE_SERVICE_ROLE_KEY が設定済み（supabase start の出力値）。
 *
 * 安全策（CLAUDE.md §23 / §32）:
 *   - ループバック (127.0.0.1 / localhost) 以外の URL には接続しない（本番接続防止）。
 *   - JWT / anon・service キー / token_hash / Cookie / DB URL の値をログへ出さない。
 *   - fixture は @example.test の架空データのみ。
 *   - RLS / migration を一切変更しない（読取り検証のみ、書込みは公開業務関数経由）。
 *   - seeded SYSTEM_ADMIN は password を設定せず Magic Link（generateLink→verifyOtp）で
 *     実 JWT セッションを取得する（seeded への updateUserById({password}) は GoTrue validation で
 *     400 になるため使わない）。新規 fixture ユーザーのみ実行ごとの一時 password を設定して
 *     password sign-in する。password / token は seed／repo／docs／env に保存せずログにも出さない。
 *     アプリの本番認証方式 (Magic Link) は変更しない（local-only なセッション取得手段のみ）。
 *
 * 注意: このスクリプトが作る架空ユーザー / 法人 / membership は、削除経路が
 *   設計上存在しない（membership は append-only・status=left のみ）。実行ごとに
 *   一意サフィックスを付けて衝突を避ける。状態を戻すには `supabase db reset`。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toSafeErrorCode } from "@/lib/auth/audit";

// ---------------------------------------------------------------------------
// 環境変数ロード（依存を増やさず .env.local を素朴にパース。値はログへ出さない）
// ---------------------------------------------------------------------------
function loadDotEnvLocal(): void {
  for (const candidate of [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "app", ".env.local"),
  ]) {
    try {
      const raw = readFileSync(candidate, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
      return;
    } catch {
      // ファイルが無ければ実プロセス環境変数にフォールバック
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`required environment variable is missing: ${name}`);
  }
  return value;
}

function assertLoopback(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL");
  }
  const loopback = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (!loopback.has(host)) {
    throw new Error(
      `refusing to run against non-loopback host "${host}" — this script is local-only (CLAUDE.md §32)`,
    );
  }
}

// ---------------------------------------------------------------------------
// レポータ（PASS/FAIL/SKIP を集計。秘密情報は載せない）
// ---------------------------------------------------------------------------
type Status = "PASS" | "FAIL" | "SKIP";
interface Result {
  id: string;
  name: string;
  status: Status;
  note: string;
}

class Reporter {
  private results: Result[] = [];

  record(id: string, name: string, status: Status, note = ""): void {
    this.results.push({ id, name, status, note });
    const mark = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "–";
    console.log(`  ${mark} ${id}  ${name}${note ? ` — ${note}` : ""}`);
  }

  /** 条件を評価して PASS/FAIL を記録する（例外は FAIL として捕捉） */
  async check(
    id: string,
    name: string,
    fn: () => Promise<{ ok: boolean; note?: string }>,
  ): Promise<void> {
    try {
      const { ok, note } = await fn();
      this.record(id, name, ok ? "PASS" : "FAIL", note ?? "");
    } catch (e) {
      this.record(
        id,
        name,
        "FAIL",
        e instanceof Error ? `threw ${e.name}` : "threw",
      );
    }
  }

  summary(): { pass: number; fail: number; skip: number } {
    const pass = this.results.filter((r) => r.status === "PASS").length;
    const fail = this.results.filter((r) => r.status === "FAIL").length;
    const skip = this.results.filter((r) => r.status === "SKIP").length;
    return { pass, fail, skip };
  }
}

// ---------------------------------------------------------------------------
// クライアント / セッションヘルパー
// ---------------------------------------------------------------------------
const NOAUTH = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

interface Ctx {
  url: string;
  anonKey: string;
  serviceKey: string;
  admin: SupabaseClient;
  anon: SupabaseClient;
  runId: string;
}

/**
 * fixture ユーザーの local-only セッション取得に使う一時 password（実行ごとに生成）。
 * bcrypt の 72 バイト上限を超えると GoTrue が 400 validation_failed を返すため 72 文字以下にする
 * （UUID 1 個で 122bit の乱数・末尾に文字種を追加。ログ／seed／repo／docs／env に保存しない）。
 */
const SESSION_PASSWORD = `${crypto.randomUUID()}-Aa1!`;

/** 秘密を含まない安全な診断だけを運ぶエラー（message も安全な識別子のみ） */
class SafeError extends Error {
  constructor(readonly safe: string) {
    super(safe);
    this.name = "SafeError";
  }
}

async function findUserIdByEmail(
  ctx: Ctx,
  email: string,
): Promise<string | null> {
  const { data, error } = await ctx.admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw new Error("listUsers failed");
  const found = data.users.find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  return found ? found.id : null;
}

/**
 * fixture ユーザーを作成し id を返す。
 * admin.createUser({password}) は GoTrue 経由で email identity 付きの正規ユーザーを作る。
 * 既に存在する場合（同一 DB での再実行時）は updateUserById で当該 run の password を設定して
 * サインイン可能にする。id は保持する。
 */
async function ensureUser(ctx: Ctx, email: string): Promise<string> {
  const created = await ctx.admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: SESSION_PASSWORD,
  });
  if (!created.error && created.data.user) return created.data.user.id;

  const id = await findUserIdByEmail(ctx, email);
  if (!id) {
    throw new SafeError(
      `ensureUser createUser=${describeError(created.error)} (user not found)`,
    );
  }
  const upd = await ctx.admin.auth.admin.updateUserById(id, {
    email_confirm: true,
    password: SESSION_PASSWORD,
  });
  if (upd.error) {
    throw new SafeError(
      `ensureUser updateUserById=${describeError(upd.error)}`,
    );
  }
  return id;
}

/**
 * 対象ユーザーの authenticated セッションを持つクライアントを返す。
 *  1) password sign-in（当該 run の password は ensureUser / updateUserById で設定済み）。
 *  2) 失敗時は magic-link OTP（generateLink→verifyOtp。identity 非依存経路）へフォールバック。
 * password / token はログへ出さない。両経路失敗時は安全な識別子のみで throw する。
 */
async function sessionFor(ctx: Ctx, email: string): Promise<SupabaseClient> {
  const pwClient = createClient(ctx.url, ctx.anonKey, NOAUTH);
  const signin = await pwClient.auth.signInWithPassword({
    email,
    password: SESSION_PASSWORD,
  });
  if (!signin.error && signin.data.session) return pwClient;

  const otpClient = createClient(ctx.url, ctx.anonKey, NOAUTH);
  const link = await ctx.admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) {
    throw new SafeError(
      `sessionFor signin=${describeError(signin.error)} generateLink=${describeError(link.error)}`,
    );
  }
  let verified = await otpClient.auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  });
  if (verified.error) {
    verified = await otpClient.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
  }
  if (verified.error || !verified.data.session) {
    throw new SafeError(
      `sessionFor signin=${describeError(signin.error)} otp=${describeError(verified.error)}`,
    );
  }
  return otpClient;
}

async function rpcError(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ message: string } | null> {
  const { error } = await client.rpc(fn, args);
  return error ? { message: error.message } : null;
}

// ---------------------------------------------------------------------------
// 初期化診断（秘密情報を出さずステージと安全な cause コードのみ報告）
// ---------------------------------------------------------------------------
const SYSADMIN_EMAIL = "sysadmin.fictional@example.test";

type Stage =
  | "env-load"
  | "client-create"
  | "admin-list-users"
  | "seeded-magiclink"
  | "seeded-verify-otp"
  | "test-setup";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * エラーから「秘密値を含まない識別子だけ」を抽出する。
 * error.message 全文は URL/JWT/password 等を含み得るため出さない。
 * 出すのは name / HTTP status / code / cause.name / cause.code のみ。
 */
function describeError(e: unknown): string {
  // SafeError は既に無害化済みの安全文字列を持つ
  if (
    e &&
    typeof e === "object" &&
    typeof (e as { safe?: unknown }).safe === "string"
  ) {
    return (e as { safe: string }).safe;
  }
  const parts: string[] = [];
  if (e && typeof e === "object") {
    const o = e as {
      name?: unknown;
      status?: unknown;
      code?: unknown;
      cause?: unknown;
    };
    if (typeof o.name === "string") parts.push(`name=${o.name}`);
    if (typeof o.status === "number") parts.push(`status=${o.status}`);
    if (typeof o.code === "string") parts.push(`code=${o.code}`);
    if (o.cause && typeof o.cause === "object") {
      const c = o.cause as { name?: unknown; code?: unknown };
      if (typeof c.name === "string") parts.push(`cause.name=${c.name}`);
      if (typeof c.code === "string") parts.push(`cause.code=${c.code}`);
    }
  }
  return parts.length > 0 ? parts.join(" ") : "no-safe-detail";
}

/** ステージ別のヒント（GoTrue / PostgREST のどちらを疑うか。秘密は含まない） */
function hintForStage(stage: Stage): string {
  switch (stage) {
    case "env-load":
      return "\n.env.local と NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY を確認してください。";
    case "admin-list-users":
    case "seeded-magiclink":
    case "seeded-verify-otp":
      return "\nGoTrue (Auth) が起動・応答しているか確認してください（`supabase status` の API URL・port 54321）。";
    case "test-setup":
      return "\nGoTrue / PostgREST が起動しているか確認してください（`supabase status`）。";
    default:
      return "\n`supabase status` を確認してください。";
  }
}

/**
 * DB reset 直後は GoTrue 起動待ちのことがあるため、初回 Admin API アクセスを
 * 短いリトライで包む（最大 10 回・約 600ms 間隔・無限リトライ禁止）。
 * error が解消したら即返す。全回失敗なら最後の結果を返す（呼出側で判定）。
 */
async function withStartupRetry<R extends { error: unknown }>(
  fn: () => Promise<R>,
): Promise<R> {
  const MAX_ATTEMPTS = 10;
  let last: R | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fn();
      if (!res.error) return res;
      last = res;
    } catch (e) {
      last = { error: e } as unknown as R;
    }
    if (attempt < MAX_ATTEMPTS - 1) await sleep(600);
  }
  return last as R;
}

type InitResult =
  | {
      ok: true;
      ctx: Ctx;
      service: SupabaseClient;
      sysadmin: SupabaseClient;
      runId: string;
      em: (label: string) => string;
    }
  | { ok: false; code: number };

/**
 * 環境ロード → クライアント生成 → seeded SYSTEM_ADMIN セッション確立。
 * 各段階を stage に記録し、失敗時は秘密情報なしで stage と安全な cause を表示する。
 */
async function initialize(): Promise<InitResult> {
  let stage: Stage = "env-load";
  try {
    loadDotEnvLocal();
    const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    assertLoopback(url);
    const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    stage = "client-create";
    const runId = Date.now().toString(36);
    const ctx: Ctx = {
      url,
      anonKey,
      serviceKey,
      admin: createClient(url, serviceKey, NOAUTH),
      anon: createClient(url, anonKey, NOAUTH),
      runId,
    };
    const service = ctx.admin; // service_role キーによる PostgREST クライアント
    const em = (label: string) => `${label}.${runId}@example.test`;
    // URL / host / key は出力しない
    console.log(
      `\n実ローカル Supabase 検証 (B1..B5, B9, B13-DB, B15) run=${runId}`,
    );
    console.log("fixtures: @example.test（架空データのみ）\n");

    // GoTrue Admin API 初回アクセス（起動待ちに短いリトライ）
    stage = "admin-list-users";
    const listed = await withStartupRetry(() =>
      ctx.admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    );
    if (listed.error) {
      console.error(
        `\nGoTrue (Auth) Admin API へ接続できません（起動待ちリトライ後も失敗）: ` +
          describeError(listed.error) +
          hintForStage(stage),
      );
      return { ok: false, code: 2 };
    }

    const seeded = listed.data.users.find(
      (u) => (u.email ?? "").toLowerCase() === SYSADMIN_EMAIL,
    );
    if (!seeded) {
      console.error(
        `\n種 SYSTEM_ADMIN (${SYSADMIN_EMAIL}) が Admin API に見つかりません。` +
          `\nseed.sql が GoTrue 正規の auth.users / auth.identities を作成しているか確認し、` +
          `\n\`supabase db reset\` を実行してください（seed 不正または未適用）。中止します。`,
      );
      return { ok: false, code: 2 };
    }

    // seeded SYSTEM_ADMIN には password を設定しない
    // （updateUserById({password}) は GoTrue validation で 400 になる）。
    // Magic Link（generateLink→verifyOtp）で実 JWT セッションを取得する。token_hash はログしない。
    stage = "seeded-magiclink";
    const link = await ctx.admin.auth.admin.generateLink({
      type: "magiclink",
      email: SYSADMIN_EMAIL,
    });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) {
      console.error(
        `\nseeded SYSTEM_ADMIN の Magic Link 発行に失敗（GoTrue）: ` +
          `generateLink=${describeError(link.error)}` +
          hintForStage(stage),
      );
      return { ok: false, code: 2 };
    }

    stage = "seeded-verify-otp";
    const client = createClient(ctx.url, ctx.anonKey, NOAUTH);
    let verified = await client.auth.verifyOtp({
      type: "email",
      token_hash: tokenHash,
    });
    if (verified.error) {
      verified = await client.auth.verifyOtp({
        type: "magiclink",
        token_hash: tokenHash,
      });
    }
    if (verified.error || !verified.data.session) {
      console.error(
        `\nseeded SYSTEM_ADMIN の Magic Link 検証に失敗（GoTrue）: ` +
          `generateLink=${describeError(link.error)} ` +
          `verifyOtp=${describeError(verified.error)}` +
          hintForStage(stage),
      );
      return { ok: false, code: 2 };
    }
    return { ok: true, ctx, service, sysadmin: client, runId, em };
  } catch (e) {
    console.error(
      `\n初期化に失敗しました（stage=${stage}）: ` +
        describeError(e) +
        hintForStage(stage),
    );
    return { ok: false, code: 2 };
  }
}

// ---------------------------------------------------------------------------
// 検証本体
// ---------------------------------------------------------------------------
async function main(): Promise<number> {
  const init = await initialize();
  if (!init.ok) return init.code;
  const { ctx, service, sysadmin, runId, em } = init;

  const r = new Reporter();
  try {
    // ======================================================================
    console.log(
      "\n[B1] auth.users → user_profiles トリガー / email 小文字ミラー",
    );
    const b1Id = await ensureUser(ctx, em("b1"));
    await r.check(
      "B1-a",
      "新規 auth.users に user_profiles が自動作成される",
      async () => {
        const { data, error } = await sysadmin
          .from("user_profiles")
          .select("id, email, system_role")
          .eq("id", b1Id)
          .maybeSingle();
        return {
          ok: !error && !!data,
          note: error ? "select error" : "profile row present",
        };
      },
    );
    await r.check(
      "B1-b",
      "email が小文字で保存される（auth 所有ミラー）",
      async () => {
        const { data } = await sysadmin
          .from("user_profiles")
          .select("email, system_role")
          .eq("id", b1Id)
          .maybeSingle();
        const okEmail = data?.email === em("b1");
        const okRole = data?.system_role === null;
        return {
          ok: okEmail && okRole,
          note: okEmail ? "lowercased & no system_role" : "email mismatch",
        };
      },
    );

    // ======================================================================
    console.log("\n[B4] anon / authenticated / service_role の挙動差");
    const uId = await ensureUser(ctx, em("b4user"));
    const uSession = await sessionFor(ctx, em("b4user"));
    await r.check(
      "B4-anon",
      "anon はテーブル権限なし（user_profiles 拒否）",
      async () => {
        const { error } = await ctx.anon.from("user_profiles").select("id");
        return { ok: !!error, note: error ? "denied" : "UNEXPECTEDLY allowed" };
      },
    );
    await r.check(
      "B4-auth",
      "authenticated は RLS で自分の行のみ SELECT",
      async () => {
        const { data, error } = await uSession
          .from("user_profiles")
          .select("id");
        const ok =
          !error &&
          Array.isArray(data) &&
          data.length === 1 &&
          data[0].id === uId;
        return {
          ok,
          note: error ? "select error" : `rows=${data?.length ?? 0}`,
        };
      },
    );
    await r.check(
      "B4-svc",
      "service_role も直接テーブル権限は無い（GRANT revoke 済み）",
      async () => {
        const { error } = await service.from("user_profiles").select("id");
        return {
          ok: !!error,
          note: error ? "denied (as designed)" : "UNEXPECTEDLY allowed",
        };
      },
    );

    // ======================================================================
    console.log("\n[B2] PostgREST 経由の RLS（テナント越境不可）");
    // 法人 + ORGANIZATION_ADMIN を業務関数で構築
    const orgCreate = await sysadmin.rpc("app_create_organization", {
      p_name: `検証法人 ${runId}`,
    });
    if (orgCreate.error || typeof orgCreate.data !== "string") {
      r.record(
        "B2-setup",
        "法人作成 RPC",
        "FAIL",
        "app_create_organization failed",
      );
    }
    const orgId = typeof orgCreate.data === "string" ? orgCreate.data : "";
    const adminId = await ensureUser(ctx, em("orgadmin"));
    const invAdmin = await sysadmin.rpc("app_invite_organization_member", {
      p_organization_id: orgId,
      p_email: em("orgadmin"),
      p_role: "ORGANIZATION_ADMIN",
    });
    const adminMembershipId =
      typeof invAdmin.data === "string" ? invAdmin.data : "";
    const adminSession = await sessionFor(ctx, em("orgadmin"));
    await adminSession.rpc("app_accept_invitation", {
      p_membership_id: adminMembershipId,
    });

    await r.check(
      "B2-cross-org",
      "非所属ユーザーは他法人 organizations を見えない（0行）",
      async () => {
        const { data, error } = await uSession
          .from("organizations")
          .select("id")
          .eq("id", orgId);
        return {
          ok: !error && (data?.length ?? 0) === 0,
          note: error ? "error" : `rows=${data?.length ?? 0}`,
        };
      },
    );
    await r.check(
      "B2-cross-mem",
      "非所属ユーザーは他法人 membership を見えない（0行）",
      async () => {
        const { data, error } = await uSession
          .from("organization_memberships")
          .select("id")
          .eq("organization_id", orgId);
        return {
          ok: !error && (data?.length ?? 0) === 0,
          note: error ? "error" : `rows=${data?.length ?? 0}`,
        };
      },
    );
    await r.check(
      "B2-member-visible",
      "所属 ORGANIZATION_ADMIN は自法人を SELECT 可（1行）",
      async () => {
        const { data, error } = await adminSession
          .from("organizations")
          .select("id")
          .eq("id", orgId);
        return {
          ok: !error && (data?.length ?? 0) === 1,
          note: error ? "error" : `rows=${data?.length ?? 0}`,
        };
      },
    );
    await r.check(
      "B2-anon",
      "anon は organizations にアクセスできない",
      async () => {
        const { error } = await ctx.anon.from("organizations").select("id");
        return { ok: !!error, note: error ? "denied" : "UNEXPECTEDLY allowed" };
      },
    );

    // ======================================================================
    console.log("\n[B3] 列 GRANT（display_name のみ更新可）");
    await r.check(
      "B3-display",
      "authenticated は自分の display_name を更新可",
      async () => {
        const { error } = await adminSession
          .from("user_profiles")
          .update({ display_name: `表示名${runId}` })
          .eq("id", adminId);
        return { ok: !error, note: error ? "update rejected" : "updated" };
      },
    );
    await r.check(
      "B3-email",
      "email 列は更新不可（列 GRANT なし）",
      async () => {
        const { error } = await adminSession
          .from("user_profiles")
          .update({ email: em("hacked") })
          .eq("id", adminId);
        return { ok: !!error, note: error ? "denied" : "UNEXPECTEDLY allowed" };
      },
    );
    await r.check(
      "B3-role",
      "system_role 列は更新不可（列 GRANT なし）",
      async () => {
        const { error } = await adminSession
          .from("user_profiles")
          .update({ system_role: "SYSTEM_ADMIN" })
          .eq("id", adminId);
        return { ok: !!error, note: error ? "denied" : "UNEXPECTEDLY allowed" };
      },
    );
    await r.check(
      "B3-intact",
      "email / system_role が改変されていない",
      async () => {
        const { data } = await sysadmin
          .from("user_profiles")
          .select("email, system_role")
          .eq("id", adminId)
          .maybeSingle();
        const ok = data?.email === em("orgadmin") && data?.system_role === null;
        return { ok, note: ok ? "unchanged" : "MUTATED" };
      },
    );

    // ======================================================================
    console.log("\n[B5] 業務 RPC の認可・監査");
    const salesId = await ensureUser(ctx, em("sales"));
    const invSales = await adminSession.rpc("app_invite_organization_member", {
      p_organization_id: orgId,
      p_email: em("sales"),
      p_role: "SALES_USER",
    });
    const salesMembershipId =
      typeof invSales.data === "string" ? invSales.data : "";
    const salesSession = await sessionFor(ctx, em("sales"));
    await salesSession.rpc("app_accept_invitation", {
      p_membership_id: salesMembershipId,
    });

    await r.check(
      "B5-sales-denied",
      "SALES_USER の招待実行は not_authorized で拒否",
      async () => {
        const err = await rpcError(
          salesSession,
          "app_invite_organization_member",
          {
            p_organization_id: orgId,
            p_email: em("victim"),
            p_role: "SALES_USER",
          },
        );
        return {
          ok: !!err && err.message.includes("not_authorized"),
          note: err ? "not_authorized" : "UNEXPECTEDLY allowed",
        };
      },
    );
    await r.check(
      "B5-admin-audit",
      "ORGANIZATION_ADMIN は自法人の監査(membership.invite)を可視",
      async () => {
        const { data, error } = await adminSession
          .from("authoritative_audit_logs")
          .select("action, success")
          .eq("organization_id", orgId)
          .eq("action", "membership.invite");
        return {
          ok: !error && (data?.length ?? 0) >= 1,
          note: error ? "error" : `rows=${data?.length ?? 0}`,
        };
      },
    );
    await r.check(
      "B5-sales-no-audit",
      "SALES_USER は監査ログを一切見えない（0行）",
      async () => {
        const { data, error } = await salesSession
          .from("authoritative_audit_logs")
          .select("id")
          .eq("organization_id", orgId);
        return {
          ok: !error && (data?.length ?? 0) === 0,
          note: error ? "error" : `rows=${data?.length ?? 0}`,
        };
      },
    );
    await r.check(
      "B5-anon-rpc",
      "anon は業務 RPC を EXECUTE できない",
      async () => {
        const err = await rpcError(ctx.anon, "app_invite_organization_member", {
          p_organization_id: orgId,
          p_email: em("victim"),
          p_role: "SALES_USER",
        });
        return { ok: !!err, note: err ? "denied" : "UNEXPECTEDLY allowed" };
      },
    );

    // ======================================================================
    console.log(
      "\n[B9] 招待先メール一致（他人の招待を accept できない・状態/監査不変）",
    );
    // A = 招待先ユーザー（invited のまま）, B = 別メールユーザー（accept を試みる攻撃者）
    await ensureUser(ctx, em("b9invitee"));
    await ensureUser(ctx, em("b9other"));
    const invB9 = await adminSession.rpc("app_invite_organization_member", {
      p_organization_id: orgId,
      p_email: em("b9invitee"),
      p_role: "SALES_USER",
    });
    const b9MembershipId = typeof invB9.data === "string" ? invB9.data : "";
    const otherSession = await sessionFor(ctx, em("b9other"));

    await r.check(
      "B9-reject",
      "他人(B) は A 向け membership を accept できない（not_authorized 42501）",
      async () => {
        const err = await rpcError(otherSession, "app_accept_invitation", {
          p_membership_id: b9MembershipId,
        });
        return {
          ok: !!err && err.message.includes("not_authorized"),
          note: err ? "not_authorized" : "UNEXPECTEDLY accepted",
        };
      },
    );
    await r.check(
      "B9-state-intact",
      "拒否後も membership は invited のまま（状態不変）",
      async () => {
        const { data } = await sysadmin
          .from("organization_memberships")
          .select("status")
          .eq("id", b9MembershipId)
          .maybeSingle();
        return {
          ok: data?.status === "invited",
          note: `status=${data?.status ?? "?"}`,
        };
      },
    );
    await r.check(
      "B9-no-forged-audit",
      "不正 accept の成功監査(membership.accept success=true)が残らない",
      async () => {
        const { data, error } = await sysadmin
          .from("authoritative_audit_logs")
          .select("id")
          .eq("action", "membership.accept")
          .eq("resource_id", b9MembershipId)
          .eq("success", true);
        return {
          ok: !error && (data?.length ?? 0) === 0,
          note: error ? "error" : `success_rows=${data?.length ?? 0}`,
        };
      },
    );

    // ======================================================================
    // B13（DB/PostgREST 別Tx経路のみ。Next.js HTTP 統合経路は docs で PENDING）
    console.log(
      "\n[B13-DB] 失敗監査の別トランザクション経路（DB/PostgREST・service_role・correlation）",
    );
    // B13a: 正規の失敗（本人が active membership を再 accept → invalid_transition）
    const corr1 = crypto.randomUUID();
    const reaccept = await salesSession.rpc("app_accept_invitation", {
      p_membership_id: salesMembershipId,
    });
    const code1 = toSafeErrorCode(reaccept.error);
    await r.check(
      "B13a-fail",
      "本人 accept 失敗を service_role が別Txで記録（success=false）",
      async () => {
        const rec = await service.rpc("app_record_membership_accept_failure", {
          p_actor_user_id: salesId,
          p_membership_id: salesMembershipId,
          p_error_code: code1,
          p_correlation_id: corr1,
        });
        if (rec.error) return { ok: false, note: "record rejected" };
        const { data } = await sysadmin
          .from("authoritative_audit_logs")
          .select("success")
          .eq("correlation_id", corr1)
          .eq("action", "membership.accept");
        const ok = (data?.length ?? 0) === 1 && data?.[0].success === false;
        return { ok, note: ok ? `error_code=${code1}` : "audit row missing" };
      },
    );
    await r.check(
      "B13a-idem",
      "同一 correlation の再送は 1 行のまま（SEC-86 冪等）",
      async () => {
        await service.rpc("app_record_membership_accept_failure", {
          p_actor_user_id: salesId,
          p_membership_id: salesMembershipId,
          p_error_code: code1,
          p_correlation_id: corr1,
        });
        const { data } = await sysadmin
          .from("authoritative_audit_logs")
          .select("id")
          .eq("correlation_id", corr1)
          .eq("action", "membership.accept");
        return {
          ok: (data?.length ?? 0) === 1,
          note: `rows=${data?.length ?? 0}`,
        };
      },
    );
    // B13b: SEC-83 — actor が membership 本人でない失敗監査は拒否され、行も残らない
    const corr2 = crypto.randomUUID();
    await r.check(
      "B13b-mismatch",
      "actor≠membership 本人の失敗監査は拒否（SEC-83・行なし）",
      async () => {
        const rec = await service.rpc("app_record_membership_accept_failure", {
          p_actor_user_id: adminId, // 他人 (org admin) が sales の membership を対象に偽装
          p_membership_id: salesMembershipId,
          p_error_code: "not_authorized",
          p_correlation_id: corr2,
        });
        const rejected =
          !!rec.error &&
          rec.error.message.includes("audit_actor_membership_mismatch");
        const { data } = await sysadmin
          .from("authoritative_audit_logs")
          .select("id")
          .eq("correlation_id", corr2);
        return {
          ok: rejected && (data?.length ?? 0) === 0,
          note: rejected ? "rejected, no row" : "NOT rejected",
        };
      },
    );
    // B13c: 失敗監査 RPC は service_role のみ（authenticated / anon は EXECUTE 不可）
    const corr3 = crypto.randomUUID();
    await r.check(
      "B13c-exec",
      "失敗監査 RPC は authenticated / anon から実行不可",
      async () => {
        const eAuth = await rpcError(
          salesSession,
          "app_record_membership_accept_failure",
          {
            p_actor_user_id: salesId,
            p_membership_id: salesMembershipId,
            p_error_code: "not_authorized",
            p_correlation_id: corr3,
          },
        );
        const eAnon = await rpcError(
          ctx.anon,
          "app_record_membership_accept_failure",
          {
            p_actor_user_id: salesId,
            p_membership_id: salesMembershipId,
            p_error_code: "not_authorized",
            p_correlation_id: corr3,
          },
        );
        const { data } = await sysadmin
          .from("authoritative_audit_logs")
          .select("id")
          .eq("correlation_id", corr3);
        return {
          ok: !!eAuth && !!eAnon && (data?.length ?? 0) === 0,
          note: "both denied, no row",
        };
      },
    );

    // ======================================================================
    console.log("\n[B15] SEC の PostgREST 再確認（直接書込拒否・監査保護）");
    await r.check(
      "B15-insert-org",
      "authenticated の organizations 直接 INSERT 拒否",
      async () => {
        const { error } = await uSession
          .from("organizations")
          .insert({ name: `直接${runId}` });
        return { ok: !!error, note: error ? "denied" : "UNEXPECTEDLY allowed" };
      },
    );
    await r.check(
      "B15-update-mem",
      "authenticated の membership 直接 UPDATE 拒否",
      async () => {
        const { error } = await uSession
          .from("organization_memberships")
          .update({ status: "active" })
          .eq("id", salesMembershipId);
        return { ok: !!error, note: error ? "denied" : "UNEXPECTEDLY allowed" };
      },
    );
    await r.check(
      "B15-delete-mem",
      "authenticated の membership 直接 DELETE 拒否",
      async () => {
        const { error } = await uSession
          .from("organization_memberships")
          .delete()
          .eq("id", salesMembershipId);
        return { ok: !!error, note: error ? "denied" : "UNEXPECTEDLY allowed" };
      },
    );
    await r.check(
      "B15-audit-write",
      "authenticated の監査ログ直接 INSERT 拒否",
      async () => {
        const { error } = await uSession
          .from("authoritative_audit_logs")
          .insert({ action: "forged", success: true });
        return { ok: !!error, note: error ? "denied" : "UNEXPECTEDLY allowed" };
      },
    );

    // ====================================================================
    const { pass, fail, skip } = r.summary();
    console.log(`\n結果: PASS=${pass} FAIL=${fail} SKIP=${skip}`);
    console.log(
      "（fixture の架空ユーザー/法人はローカル DB に残る。状態初期化は `supabase db reset`）",
    );
    return fail === 0 ? 0 : 1;
  } catch (e) {
    // テスト準備（fixture 作成/セッション取得など）での想定外失敗。秘密は出さない。
    console.error(
      `\nテスト準備(test-setup)で失敗しました: ` +
        describeError(e) +
        hintForStage("test-setup"),
    );
    return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    // 最終防御。error.message 全文は出さず安全な識別子のみ。
    console.error(`verify-supabase failed: ${describeError(e)}`);
    process.exit(2);
  });
