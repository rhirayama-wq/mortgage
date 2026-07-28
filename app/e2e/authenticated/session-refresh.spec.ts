/**
 * AUTH-E2E-28, 29 — B10-refresh（AUTH-10 核心）: セッション refresh の実機検証。
 * FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
 *
 * 検証する経路（アプリの正規経路のみ。refreshSession() の直接呼出しはしない）:
 *   storageState の実 Cookie → `expires_at` を過去へ書き換え（期限切れ相当）→
 *   通常のページ遷移 → middleware updateSession() の getUser() が期限切れを検知 →
 *   refresh token で GoTrue から新セッション取得 → Cookie 書換え（唯一の書込経路:
 *   src/lib/supabase/middleware.ts）→ Server Component / Server Action は
 *   refresh 済み Cookie で認可継続。
 *
 * 期待結果の根拠（勝手に決めない）:
 *   - src/middleware.ts / src/lib/supabase/middleware.ts
 *       getUser() でトークン検証・必要なら refresh、redirect 時も Cookie 引継ぎ
 *   - src/lib/supabase/server.ts
 *       Server Component からは Cookie を書けず、refresh の書込は middleware に集約
 *   - src/lib/auth/membership.ts
 *       getUser() が 400/401/403 の場合は「通常の未認証」として扱う（/login 行き）
 *   - supabase/config.toml
 *       jwt_expiry = 3600 / enable_refresh_token_rotation = true（refresh 後は
 *       access token と refresh token の双方が新しい値になる）
 *   - src/middleware.ts
 *       未認証（refresh 不能を含む）の非公開パスへのリクエストは、GET / POST を
 *       問わず /login への redirect 応答になる（AUTH-E2E-29 はこの応答を直接検証）
 *   - AUTH-E2E-26（audit-http.spec.ts）
 *       実在しない membership UUID の受諾は membership_not_found で拒否され状態不変
 *
 * 他テストとの分離:
 *   - 使用 fixture は invited のみ。refresh による token rotation は本テストの
 *     BrowserContext 内で完結し、storageState ファイルは書き換えない。
 *     本 spec はアルファベット順で authenticated project の最後に実行されるため、
 *     rotation が他 spec の Cookie に影響することはない。
 *   - AUTH-E2E-29 は実在した refresh token を GoTrue へ送らない（無効な固定文字列を
 *     使う）ため、既存セッションファミリーの reuse 検知・失効を誘発しない。
 *
 * 秘密情報の非露出（CLAUDE.md §23）:
 *   - token / Cookie 値 / storageState 内容 / JWT はログ・assert 差分へ出さない。
 *     比較はすべて boolean へ畳んでから assert する。
 */

import { test, expect, expectLanding, pathnameOf } from "../fixtures/authenticated-test";
import { ORG_A_NAME, ORG_B_NAME } from "../fixtures/identities";
import {
  captureAuthSessionSnapshot,
  forceAccessTokenExpiry,
  invalidateRefreshToken,
  nowInSeconds,
} from "../fixtures/session-cookie";

const hasLocalSupabase = !!process.env.E2E_SUPABASE_LOCAL;

test.skip(
  !hasLocalSupabase,
  "E2E_SUPABASE_LOCAL is not set — B10-refresh E2E は SUPABASE_PENDING",
);

// ---------------------------------------------------------------------------
// AUTH-E2E-28: access token 失効後の自動 refresh（成功経路）
// ---------------------------------------------------------------------------

test("AUTH-E2E-28: access token 失効後、middleware の正規経路で refresh されセッション・認可文脈が維持される", async ({
  invitedPage,
}) => {
  const context = invitedPage.context();

  // 基準点: 認証済みで自法人（A）の招待だけが見える（テナント/RLS 文脈の基準）
  await expectLanding(invitedPage, "/pending-invitation", "/pending-invitation");
  await expect(invitedPage.getByText("招待が届いています")).toBeVisible();
  await expect(invitedPage.getByText(ORG_A_NAME)).toBeVisible();
  await expect(invitedPage.getByText(ORG_B_NAME)).toHaveCount(0);

  const before = await captureAuthSessionSnapshot(context);

  // 前提確認: この時点の access token はまだ有効（「有効なままの確認」を PASS と
  // 誤認しないためのガード。以降で明示的に期限切れ相当へ落とす）
  expect(
    before.expiresAt > nowInSeconds(),
    "precondition: access token is not yet expired",
  ).toBe(true);
  expect(before.cookieCount > 0, "precondition: auth cookie present").toBe(true);
  expect(before.allHttpOnly, "precondition: auth cookies are httpOnly").toBe(true);

  // access token だけを期限切れ相当へ（refresh token は無傷のまま）
  await forceAccessTokenExpiry(context);
  const expired = await captureAuthSessionSnapshot(context);
  expect(
    expired.expiresAt < nowInSeconds(),
    "access token is now expired in the stored session",
  ).toBe(true);
  expect(
    expired.refreshToken === before.refreshToken,
    "refresh token is untouched by the expiry forcing",
  ).toBe(true);

  // 通常のページ遷移 → middleware getUser() が期限切れを検知して refresh する
  await invitedPage.goto("/pending-invitation");

  // 再ログイン画面へ飛ばされない（セッション維持）
  expect(
    pathnameOf(invitedPage) === "/pending-invitation",
    "stays on the authenticated page (not bounced to /login)",
  ).toBe(true);
  await expect(invitedPage.getByText("招待が届いています")).toBeVisible();

  // RLS / テナント文脈の維持: 自法人の招待は見え、他法人は一切見えない
  await expect(invitedPage.getByText(ORG_A_NAME)).toBeVisible();
  await expect(invitedPage.getByText(ORG_B_NAME)).toHaveCount(0);

  // refresh の実発生を Cookie 差分（boolean のみ）で確認する
  const after = await captureAuthSessionSnapshot(context);
  expect(after.userId === before.userId, "same user id after refresh").toBe(true);
  expect(
    after.accessToken !== before.accessToken,
    "a new access token was issued by the refresh",
  ).toBe(true);
  expect(
    after.refreshToken !== before.refreshToken,
    "refresh token was rotated (enable_refresh_token_rotation = true)",
  ).toBe(true);
  expect(
    after.expiresAt > nowInSeconds(),
    "new session expiry is in the future",
  ).toBe(true);
  expect(after.allHttpOnly, "auth cookies remain httpOnly after refresh").toBe(true);

  // refresh 済みセッションで protected Server Action を実行できる:
  // 実在しない membership UUID の受諾は membership_not_found で安全に拒否され、
  // 状態は変わらない（AUTH-E2E-26 と同じ冪等パターン）。/login へ飛ばないことが
  // 「Server Action が認証済みとして実行された」ことの証明になる。
  const ghostMembershipId = crypto.randomUUID();
  const hidden = invitedPage.locator('input[name="membershipId"]').first();
  await expect(hidden).toHaveCount(1);
  await hidden.evaluate((el, value) => {
    (el as HTMLInputElement).value = value;
  }, ghostMembershipId);
  await invitedPage.getByRole("button", { name: "招待を受諾" }).first().click();
  await invitedPage.waitForURL(/\/pending-invitation\?e=1$/);
  await expect(invitedPage.getByText("招待を受諾できませんでした")).toBeVisible();

  // membership 状態・ロールは不変: invited のままであり /cases へは入れない
  await expectLanding(invitedPage, "/cases", "/pending-invitation");
});

// ---------------------------------------------------------------------------
// AUTH-E2E-29: refresh token も無効な場合の安全な失敗（失敗経路）
// ---------------------------------------------------------------------------

test("AUTH-E2E-29: refresh token も無効なら認証済みとして扱われず、安全に /login へ誘導される", async ({
  invitedPage,
}) => {
  const context = invitedPage.context();

  // 基準点: 認証済みで受諾フォームが表示されている
  await expectLanding(invitedPage, "/pending-invitation", "/pending-invitation");
  const hidden = invitedPage.locator('input[name="membershipId"]').first();
  await expect(hidden).toHaveCount(1);

  // 万一 Server Action が実行されてしまっても状態が変わらないよう、
  // 送信対象を実在しない membership UUID に差し替えておく（防御的な冪等化）
  await hidden.evaluate((el, value) => {
    (el as HTMLInputElement).value = value;
  }, crypto.randomUUID());

  // access token 期限切れ相当 + refresh token 無効（存在しない固定文字列）
  await invalidateRefreshToken(context);

  // stale Cookie のまま Server Action を送信する。
  // middleware が POST を未認証と判定して /login への redirect を返すため、
  // 業務ハンドラ本体（app_accept_invitation の呼出し）には到達しない。
  // 注意: middleware に redirect された Server Action POST を Next.js クライアントが
  // 画面遷移へ変換するかは仕様上保証されない（2026-07-27 の Mac 実測で、URL は
  // /pending-invitation のまま変わらないことを確認）。そのためクライアント側の
  // URL 変化ではなく、サーバー応答そのもの（redirect status と Location の
  // pathname）を検証する。値・token は出力しない（pathname / status のみ）。
  const [actionResponse] = await Promise.all([
    invitedPage.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        new URL(res.url()).pathname === "/pending-invitation",
    ),
    invitedPage.getByRole("button", { name: "招待を受諾" }).first().click(),
  ]);
  const actionStatus = actionResponse.status();
  expect(
    actionStatus >= 300 && actionStatus < 400,
    `server action POST is answered with a redirect (status=${actionStatus})`,
  ).toBe(true);
  const locationPathname = new URL(
    actionResponse.headers()["location"] ?? "/",
    "http://localhost:3000",
  ).pathname;
  expect(locationPathname, "redirect target pathname is /login").toBe("/login");

  // 保護ルートも認証済みとして扱われない（他ユーザー・以前のセッションへの
  // フォールバックが無いことの確認: いかなる着地先でもなく /login であること）
  await expectLanding(invitedPage, "/cases", "/login");

  // /login 自体は安定して表示される（無限 redirect にならず安全に着地する）
  await expectLanding(invitedPage, "/login", "/login");
  await expect(invitedPage.getByLabel("メールアドレス")).toBeVisible();

  // 画面へ例外詳細や token を出さない（JWT 断片が本文へ漏れていないこと）
  const bodyText = await invitedPage.locator("body").innerText();
  expect(
    bodyText.includes("eyJ"),
    "no JWT-like fragment is rendered on the page",
  ).toBe(false);
});
