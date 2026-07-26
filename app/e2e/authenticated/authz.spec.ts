/**
 * AUTH-12..16 — 認証済みセッションによるロール別認可 / membership 状態別拒否 /
 * 他法人 ID 拒否の実機 E2E（実 HTTP・実 Cookie・実 Supabase local）。
 * FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
 *
 * 期待結果の根拠（勝手に決めない）:
 *  - src/lib/auth/access.ts       decideLanding / routeForDecision
 *  - src/lib/auth/require.ts      requireOrgAccess / requireSystemAdmin は redirect（403 ではない）
 *  - src/lib/auth/membership.ts   status = 'left' の行は問い合わせ段階で除外される → no-access
 *  - src/lib/auth/access.test.ts  AUTH-12a..13c（OFFLINE_UNIT_PASS）と同じ判定をアプリ経路で再確認
 *
 * 対象外（混同しない）:
 *  - 未認証の保護ルート拒否は e2e/auth.spec.ts AUTH-E2E-02 で PASS 済み（重複しない）
 *  - B13-HTTP（失敗監査の別 HTTP / 別トランザクション記録）はこのファイルの対象外。
 *    AUTH-E2E-23 は「拒否されること・状態が変わらないこと」のみを検証し、監査記録は主張しない。
 */

import { test, expect, expectLanding } from "../fixtures/authenticated-test";
import { membershipIdOf } from "../fixtures/manifest";
import { ORG_A_NAME, ORG_B_NAME } from "../fixtures/identities";

const hasLocalSupabase = !!process.env.E2E_SUPABASE_LOCAL;

test.skip(
  !hasLocalSupabase,
  "E2E_SUPABASE_LOCAL is not set — 認証済み E2E は SUPABASE_PENDING",
);

// ---------------------------------------------------------------------------
// 1. 正常系（active な正規メンバー / SYSTEM_ADMIN）
// ---------------------------------------------------------------------------

test("AUTH-E2E-12: active な SALES_USER は自法人の /cases へアクセスできる", async ({
  orgAMemberPage,
}) => {
  await expectLanding(orgAMemberPage, "/cases", "/cases");
  await expect(orgAMemberPage.getByText(ORG_A_NAME)).toBeVisible();
  await expect(orgAMemberPage.getByText(ORG_B_NAME)).toHaveCount(0);
});

test("AUTH-E2E-13: active な ORGANIZATION_ADMIN は / から /cases へ着地する", async ({
  orgAAdminPage,
}) => {
  await expectLanding(orgAAdminPage, "/", "/cases");
  await expect(orgAAdminPage.getByText(ORG_A_NAME)).toBeVisible();
});

test("AUTH-E2E-14: SYSTEM_ADMIN は / から /system-console へ着地する", async ({
  systemAdminPage,
}) => {
  await expectLanding(systemAdminPage, "/", "/system-console");
  await expect(systemAdminPage.getByText("システム管理コンソール")).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2. ロール別拒否（URL 直打ち = サーバー側での拒否）
// ---------------------------------------------------------------------------

test("AUTH-E2E-15: SALES_USER は URL 直打ちでも /system-console に入れない", async ({
  orgAMemberPage,
}) => {
  await expectLanding(orgAMemberPage, "/system-console", "/cases");
  await expect(orgAMemberPage.getByText("システム管理コンソール")).toHaveCount(0);
});

test("AUTH-E2E-16: ORGANIZATION_ADMIN も /system-console に入れない（法人管理者 ≠ 全体管理者）", async ({
  orgAAdminPage,
}) => {
  await expectLanding(orgAAdminPage, "/system-console", "/cases");
  await expect(orgAAdminPage.getByText("システム管理コンソール")).toHaveCount(0);
});

test("AUTH-E2E-17: SYSTEM_ADMIN は所属が無い限り /cases を得ない（境界の逆方向）", async ({
  systemAdminPage,
}) => {
  await expectLanding(systemAdminPage, "/cases", "/system-console");
});

// ---------------------------------------------------------------------------
// 3. membership 状態別拒否（invited / suspended / left）
// ---------------------------------------------------------------------------

test("AUTH-E2E-18: invited は /cases に入れず /pending-invitation へ送られる", async ({
  invitedPage,
}) => {
  await expectLanding(invitedPage, "/cases", "/pending-invitation");
  await expect(invitedPage.getByText("招待が届いています")).toBeVisible();
});

test("AUTH-E2E-19: invited は /system-console にも入れない", async ({ invitedPage }) => {
  await expectLanding(invitedPage, "/system-console", "/pending-invitation");
});

test("AUTH-E2E-20: suspended は /cases に入れず /no-access へ送られる", async ({
  suspendedPage,
}) => {
  await expectLanding(suspendedPage, "/cases", "/no-access");
  await expect(suspendedPage.getByText("利用できる法人がありません")).toBeVisible();
  await expect(suspendedPage.getByText(ORG_A_NAME)).toHaveCount(0);
});

test("AUTH-E2E-21: left は /cases に入れず /no-access へ送られる", async ({ leftPage }) => {
  await expectLanding(leftPage, "/cases", "/no-access");
  await expect(leftPage.getByText("利用できる法人がありません")).toBeVisible();
  await expect(leftPage.getByText(ORG_A_NAME)).toHaveCount(0);
});

test("AUTH-E2E-22: suspended / left は /system-console にも入れない", async ({
  suspendedPage,
  leftPage,
}) => {
  await expectLanding(suspendedPage, "/system-console", "/no-access");
  await expectLanding(leftPage, "/system-console", "/no-access");
});

// ---------------------------------------------------------------------------
// 4. 他法人 ID 拒否（IDOR）
// ---------------------------------------------------------------------------

test("AUTH-E2E-23: 法人 B のメンバーには法人 B の文脈だけが見える（テナント境界の対向側）", async ({
  orgBAdminPage,
}) => {
  await expectLanding(orgBAdminPage, "/cases", "/cases");
  await expect(orgBAdminPage.getByText(ORG_B_NAME)).toBeVisible();
  await expect(orgBAdminPage.getByText(ORG_A_NAME)).toHaveCount(0);
});

test("AUTH-E2E-24: URL / query に他法人 ID を差し替えても文脈は切り替わらない", async ({
  orgAMemberPage,
  fixtureManifest,
}) => {
  const orgB = fixtureManifest.organizationIds.B;
  await expectLanding(
    orgAMemberPage,
    `/cases?organizationId=${encodeURIComponent(orgB)}&organization_id=${encodeURIComponent(orgB)}`,
    "/cases",
  );
  await expect(orgAMemberPage.getByText(ORG_A_NAME)).toBeVisible();
  await expect(orgAMemberPage.getByText(ORG_B_NAME)).toHaveCount(0);
});

test("AUTH-E2E-25: request body の membership ID を他法人のものへ差し替えても受諾されない", async ({
  invitedPage,
  orgBInviteePage,
  fixtureManifest,
}) => {
  const foreignMembershipId = membershipIdOf(fixtureManifest, "orgBInvitee");

  // 法人 A の招待中ユーザーの画面には、法人 A の招待だけが見える（他法人の存在を漏らさない）
  await expectLanding(invitedPage, "/pending-invitation", "/pending-invitation");
  await expect(invitedPage.getByText(ORG_A_NAME)).toBeVisible();
  await expect(invitedPage.getByText(ORG_B_NAME)).toHaveCount(0);
  await expect(invitedPage.getByText(foreignMembershipId)).toHaveCount(0);

  // hidden input を他法人の membership ID へ改竄して実 POST（Server Action）
  await invitedPage
    .locator('input[name="membershipId"]')
    .first()
    .evaluate((el, value) => {
      (el as HTMLInputElement).value = value;
    }, foreignMembershipId);
  await invitedPage.getByRole("button", { name: "招待を受諾" }).first().click();

  // 拒否され、共通のエラー文言に戻る（他法人の情報は出さない）
  await invitedPage.waitForURL(/\/pending-invitation\?e=1$/);
  await expect(invitedPage.getByText("招待を受諾できませんでした")).toBeVisible();
  await expect(invitedPage.getByText(ORG_B_NAME)).toHaveCount(0);

  // 攻撃者側は依然 invited のまま（受諾されていない）
  await expectLanding(invitedPage, "/cases", "/pending-invitation");

  // 標的側（法人 B の招待）も invited のまま = サーバー側で状態が変わっていない
  await expectLanding(orgBInviteePage, "/cases", "/pending-invitation");
  await expect(orgBInviteePage.getByText(ORG_B_NAME)).toBeVisible();
});
