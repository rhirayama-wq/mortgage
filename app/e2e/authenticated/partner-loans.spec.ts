/**
 * P2B-E2E — 提携ローン管理の実機 E2E（実 HTTP・実 Cookie・実 Supabase local）。
 * FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
 *
 * 対象（Phase 2A-2b）:
 *  - ORG_ADMIN が提携ローンを登録 → 一覧/詳細表示 → 有効化 → 新 version 作成
 *  - SALES_USER は有効商品を閲覧できるが編集 CTA・登録画面へ入れない
 *  - 他 organization の管理者には当該提携ローンが不可視（テナント境界）
 *
 * 期待の根拠: src/app/(org-app)/settings/partner-loans/**、0004 migration の RLS/RPC。
 * フレッシュな local DB（supabase db reset 後の e2e:local）を前提にする。
 */

import { test, expect } from "../fixtures/authenticated-test";
import { ORG_A_NAME } from "../fixtures/identities";

const hasLocalSupabase = !!process.env.E2E_SUPABASE_LOCAL;

test.skip(
  !hasLocalSupabase,
  "E2E_SUPABASE_LOCAL is not set — 提携ローン E2E は SUPABASE_PENDING",
);

test("P2B-E2E-01: ORG_ADMIN 登録→有効化→新version、SALES 閲覧のみ、他org 不可視", async ({
  orgAAdminPage,
  orgAMemberPage,
  orgBAdminPage,
}) => {
  const name = `架空 提携ローン ${Date.now()}`;

  // --- ORG_ADMIN: 登録 ---
  await orgAAdminPage.goto("/settings/partner-loans/new");
  await orgAAdminPage.getByLabel("金融機関名（架空）").fill("架空信用金庫");
  await orgAAdminPage.getByLabel("提携ローン名").fill(name);
  await orgAAdminPage.getByLabel("商品名").fill("架空 提携フラット");
  await orgAAdminPage.locator('input[name="indicativeRatePercent"]').fill("1.25");
  await orgAAdminPage.locator('input[name="maxLoanAmountYen"]').fill("100000000");
  await orgAAdminPage.getByRole("button", { name: "提携ローンを登録" }).click();
  await orgAAdminPage.waitForURL(/\/settings\/partner-loans\/[0-9a-f-]{36}/);
  await expect(orgAAdminPage.getByRole("heading", { name })).toBeVisible();
  await expect(orgAAdminPage.getByText("下書き").first()).toBeVisible();

  // --- 有効化 ---
  await orgAAdminPage.getByRole("button", { name: "診断対象として有効化" }).click();
  await orgAAdminPage.waitForURL(/activated=1/);
  await expect(orgAAdminPage.getByText("有効").first()).toBeVisible();

  // --- 新 version 作成（編集） ---
  await orgAAdminPage.getByRole("link", { name: "編集（新バージョン作成）" }).click();
  await orgAAdminPage.waitForURL(/\/edit$/);
  await orgAAdminPage.locator('input[name="indicativeRatePercent"]').fill("1.10");
  await orgAAdminPage.getByRole("button", { name: "新しいバージョンを保存" }).click();
  await orgAAdminPage.waitForURL(/updated=1/);
  await expect(orgAAdminPage.getByText("現在のバージョン（v2）")).toBeVisible();
  await expect(orgAAdminPage.getByText("過去のバージョン")).toBeVisible();

  // --- SALES: 閲覧のみ（登録 CTA なし・新規画面へ入れない） ---
  await orgAMemberPage.goto("/settings/partner-loans");
  await expect(orgAMemberPage.getByText(name)).toBeVisible();
  await expect(
    orgAMemberPage.getByRole("link", { name: "新しい提携ローンを登録" }),
  ).toHaveCount(0);
  await orgAMemberPage.goto("/settings/partner-loans/new");
  await orgAMemberPage.waitForURL(/\/settings\/partner-loans$/);

  // --- 他 organization からは不可視 ---
  await orgBAdminPage.goto("/settings/partner-loans");
  await expect(orgBAdminPage.getByText(name)).toHaveCount(0);
  await expect(orgBAdminPage.getByText(ORG_A_NAME)).toHaveCount(0);
});
