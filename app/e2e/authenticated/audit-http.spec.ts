/**
 * B13-HTTP / AUTH-E2E-26, 27 — Server Action 経由の実 HTTP 失敗監査。
 * FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
 *
 * B13-DB（verify:supabase の B13a/b/c）との役割分担:
 *   B13-DB   : RPC 単体として、失敗監査が service_role の別トランザクションで記録でき、
 *              偽造拒否（SEC-83）・冪等（SEC-86）・EXECUTE 権限が守られること。
 *   B13-HTTP : ブラウザの実フォーム送信 → Next.js Server Action
 *              (src/app/pending-invitation/actions.ts) → 業務 RPC 失敗 → 失敗監査 RPC
 *              という **アプリの実経路** で、監査行が実際に DB へ書かれること。
 *
 * AUTH-E2E-25 との役割分担（重複させない）:
 *   AUTH-E2E-25 : 他法人 membership ID へ差し替えても受諾されない・状態が変わらない
 *                 （テナント越境拒否と状態不変。監査は主張しない）
 *   AUTH-E2E-26 : 正当な業務失敗が success=false 監査として別 Tx で 1 件記録される
 *   AUTH-E2E-27 : SEC-83 により、偽造された失敗監査が書かれない
 *
 * 期待結果の根拠（勝手に決めない）:
 *   - src/app/pending-invitation/actions.ts     失敗時に recordMembershipAcceptFailure を await
 *   - src/lib/auth/audit.ts                     error_code 正規化・ガード拒否と障害の分離
 *   - supabase/migrations/0001_...sql
 *       app_accept_invitation                   存在しない membership → membership_not_found
 *       app_record_membership_accept_failure    action/resource_type/success は DB 側固定、
 *                                               organization_id は DB 側解決、actor 不一致は
 *                                               audit_actor_membership_mismatch で拒否
 *       authoritative_audit_logs_correlation_uniq  (correlation_id, action, success) 冪等
 *
 * 監査行の読み取りは SYSTEM_ADMIN セッション（RLS audit_select_system_admin）で行う。
 * service_role にはテーブル SELECT 権限が無い（migration 0001 の GRANT 設計）。
 * GRANT / RLS / RPC 定義は一切変更していない。
 *
 * fixture 破壊性: いずれのテストも membership の状態を変更しない。対象 UUID は
 * 実行ごとに新規生成するため、連続実行しても前回の監査行と混ざらない。
 *
 * 秘密情報（token / Cookie / Magic Link URL / anon key / service role key）は出力しない。
 */

import { test, expect } from "../fixtures/authenticated-test";
import { membershipIdOf } from "../fixtures/manifest";
import { fixtureByKey, SEEDED_SYSTEM_ADMIN_EMAIL } from "../fixtures/identities";
import { createAuditReader, type AuditReader } from "../fixtures/audit-reader";

const hasLocalSupabase = !!process.env.E2E_SUPABASE_LOCAL;

test.skip(
  !hasLocalSupabase,
  "E2E_SUPABASE_LOCAL is not set — B13-HTTP 失敗監査 E2E は SUPABASE_PENDING",
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** SYSTEM_ADMIN セッションは 1 度だけ確立して使い回す（skip 時は生成しない）。 */
let readerPromise: Promise<AuditReader> | null = null;
function auditReader(): Promise<AuditReader> {
  readerPromise ??= createAuditReader(SEEDED_SYSTEM_ADMIN_EMAIL);
  return readerPromise;
}

// ---------------------------------------------------------------------------
// AUTH-E2E-26: 正当な業務失敗 → 別 Tx の success=false 監査が 1 件
// ---------------------------------------------------------------------------

test("AUTH-E2E-26: Server Action 経由の業務失敗が別Txで失敗監査として1件記録される", async ({
  invitedPage,
}) => {
  const reader = await auditReader();

  // 構文上は正当だが実在しない membership UUID。
  // 業務 RPC app_accept_invitation は membership_not_found を raise し、
  // fixture の状態は一切変更されない（再実行可能・他テストに影響しない）。
  const ghostMembershipId = crypto.randomUUID();

  // 実行前は当然 0 件（毎回新しい UUID なので前回実行の行と混ざらない）
  expect(await reader.byResourceId(ghostMembershipId)).toHaveLength(0);

  // ①②③④ 実ブラウザ・実 Cookie・実 Server Action・実 Supabase local
  await invitedPage.goto("/pending-invitation");
  const hidden = invitedPage.locator('input[name="membershipId"]').first();
  await expect(hidden).toHaveCount(1);
  await hidden.evaluate((el, value) => {
    (el as HTMLInputElement).value = value;
  }, ghostMembershipId);
  await invitedPage.getByRole("button", { name: "招待を受諾" }).first().click();

  // ⑥ UI は既存仕様どおり失敗表示へ戻る（他法人・内部詳細を出さない共通文言）
  await invitedPage.waitForURL(/\/pending-invitation\?e=1$/);
  await expect(
    invitedPage.getByText("招待を受諾できませんでした"),
  ).toBeVisible();

  // ⑦ 本人の membership 状態は不変（invited のまま招待が残っている）
  await expect(
    invitedPage.locator('input[name="membershipId"]'),
  ).not.toHaveCount(0);

  const rows = await reader.byResourceId(ghostMembershipId);

  // ⑧ success=true の偽監査は存在しない
  expect(rows.filter((r) => r.success)).toHaveLength(0);

  // ⑨ success=false の失敗監査がちょうど 1 件（別 Tx で記録されている）
  const failures = rows.filter((r) => !r.success);
  expect(failures).toHaveLength(1);
  const row = failures[0];

  // ⑩ actor は request body ではなく認証済みセッション本人（getUser() 由来）
  const expectedActor = await reader.userIdByEmail(fixtureByKey("invited").email);
  expect(row.actorUserId).toBe(expectedActor);

  // ⑪ target membership ID は送信した UUID
  expect(row.resourceId).toBe(ghostMembershipId);
  expect(row.resourceType).toBe("organization_membership");

  // ⑫ action は DB 側固定値
  expect(row.action).toBe("membership.accept");

  // ⑬ error_code は許可リスト内へ正規化されている
  expect(row.errorCode).toBe("membership_not_found");

  // ⑮ membership が存在しないため organization_id は DB 側で NULL に解決される
  expect(row.organizationId).toBeNull();

  // ⑭ correlation ID が存在し UUID 形式（1 リクエスト 1 個）
  expect(row.correlationId).toMatch(UUID_RE);

  // ⑯ 同一 correlation の重複が無い（unique partial index による冪等）
  const correlationIds = new Set(failures.map((r) => r.correlationId));
  expect(correlationIds.size).toBe(1);

  const resend = await reader.callFailureAuditRpc({
    actorUserId: expectedActor,
    membershipId: ghostMembershipId,
    errorCode: "membership_not_found",
    correlationId: row.correlationId as string,
  });
  expect(resend.ok).toBe(true);
  const afterResend = await reader.byResourceId(ghostMembershipId);
  expect(afterResend.filter((r) => !r.success)).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// AUTH-E2E-27: SEC-83 — 偽造された失敗監査は書かれない
// ---------------------------------------------------------------------------

test("AUTH-E2E-27: 他法人 membership を対象にした失敗監査は偽造記録を許さない（SEC-83）", async ({
  invitedPage,
  fixtureManifest,
}) => {
  const reader = await auditReader();
  const foreignMembershipId = membershipIdOf(fixtureManifest, "orgBInvitee");

  // 実行前の監査行数（他法人 membership の行は前回実行から増えていないはず）
  const before = await reader.byResourceId(foreignMembershipId);

  // 実 HTTP: 法人 A の invited ユーザーが他法人の membership ID を送る
  await invitedPage.goto("/pending-invitation");
  await invitedPage
    .locator('input[name="membershipId"]')
    .first()
    .evaluate((el, value) => {
      (el as HTMLInputElement).value = value;
    }, foreignMembershipId);
  await invitedPage.getByRole("button", { name: "招待を受諾" }).first().click();

  // 業務処理は拒否される（状態不変の網羅は AUTH-E2E-25 の担当）
  await invitedPage.waitForURL(/\/pending-invitation\?e=1$/);

  const after = await reader.byResourceId(foreignMembershipId);

  // 成功監査は存在しない
  expect(after.filter((r) => r.success)).toHaveLength(0);
  // 偽造された success=false 監査も書かれていない（行数が増えていない）
  expect(after).toHaveLength(before.length);

  // SEC-83 ガードそのものの確認: service_role で直接呼んでも拒否され、行は残らない
  const correlationId = crypto.randomUUID();
  const forged = await reader.callFailureAuditRpc({
    actorUserId: await reader.userIdByEmail(fixtureByKey("invited").email),
    membershipId: foreignMembershipId,
    errorCode: "not_authorized",
    correlationId,
  });
  expect(forged.ok).toBe(false);
  expect(forged.guardRefused).toBe(true);

  const afterForge = await reader.byResourceId(foreignMembershipId);
  expect(
    afterForge.filter((r) => r.correlationId === correlationId),
  ).toHaveLength(0);
  expect(afterForge).toHaveLength(before.length);
});
