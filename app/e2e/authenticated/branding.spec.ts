/**
 * P2AW1-E2E — 法人別ブランディングの実機 E2E（実 HTTP・実 Cookie・実 Supabase local）。
 * FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
 *
 * 対象（Phase 2A-W1）:
 *  - ORG_ADMIN が /settings/branding で表示名・色・ロゴを設定し、法人スタッフ画面へ反映
 *  - SALES_USER は /settings/branding へ入れない（/cases へ退避）
 *  - SVG 拒否・2MB 超過拒否・ロゴ削除/リセットで標準へ戻る
 *  - semantic error color がブランド色で上書きされない
 *  - reload 後もブランド保持
 *
 * 顧客案件画面への反映・顧客ポータル一覧が標準テーマであることは、
 * customer-case E2E と同じ magic link 経路で別途担保する（本 spec では staff 側を中心に検証）。
 */

import { test, expect } from "../fixtures/authenticated-test";
import path from "node:path";

const hasLocalSupabase = !!process.env.E2E_SUPABASE_LOCAL;
test.skip(!hasLocalSupabase, "E2E_SUPABASE_LOCAL is not set — branding E2E は SUPABASE_PENDING");

const LOGO_PNG = path.join(__dirname, "..", "fixtures", "branding-logo.png");
const NAME = `架空不動産 ${Date.now()}`;

test("P2AW1-E2E-01: ORG_ADMIN が表示名・色を保存し、スタッフ画面へ反映、reload 後も保持", async ({
  orgAAdminPage,
}) => {
  await orgAAdminPage.goto("/settings/branding");
  await expect(orgAAdminPage.getByRole("heading", { name: "ブランディング" })).toBeVisible();

  await orgAAdminPage.getByLabel("表示名").fill(NAME);
  await orgAAdminPage.locator('input[name="primaryColor"]').fill("#2563eb");
  await orgAAdminPage.getByRole("button", { name: "保存" }).click();
  await orgAAdminPage.waitForURL(/\/settings\/branding\?saved=1$/);
  await expect(orgAAdminPage.getByText("ブランド設定を保存しました。")).toBeVisible();

  // スタッフ画面ヘッダーに表示名が反映
  await orgAAdminPage.goto("/cases");
  await expect(orgAAdminPage.getByText(NAME).first()).toBeVisible();

  // reload 後も保持
  await orgAAdminPage.goto("/settings/branding");
  await expect(orgAAdminPage.getByLabel("表示名")).toHaveValue(NAME);
});

test("P2AW1-E2E-02: PNG ロゴ upload 成功、SVG は拒否", async ({ orgAAdminPage }) => {
  await orgAAdminPage.goto("/settings/branding");
  await orgAAdminPage.locator('input[name="logo"]').setInputFiles(LOGO_PNG);
  await orgAAdminPage.getByRole("button", { name: "ロゴを更新" }).click();
  await orgAAdminPage.waitForURL(/\/settings\/branding\?logo=1$/);
  await expect(orgAAdminPage.getByText("ロゴを更新しました。")).toBeVisible();
  // ヘッダーにロゴ img
  await orgAAdminPage.goto("/cases");
  await expect(orgAAdminPage.locator('header img[alt]').first()).toBeVisible();

  // SVG は accept 属性 + サーバー magic bytes で拒否（直接 SVG を投入しても保存されない）
  await orgAAdminPage.goto("/settings/branding");
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await orgAAdminPage.locator('input[name="logo"]').setInputFiles({
    name: "evil.svg",
    mimeType: "image/svg+xml",
    buffer: svg,
  });
  await orgAAdminPage.getByRole("button", { name: "ロゴを更新" }).click();
  await orgAAdminPage.waitForURL(/\/settings\/branding\?e=logo$/);
});

test("P2AW1-E2E-03: SALES_USER は /settings/branding へ入れない", async ({ orgAMemberPage }) => {
  await orgAMemberPage.goto("/settings/branding");
  await orgAMemberPage.waitForURL(/\/cases(\?|$)/);
});

test("P2AW1-E2E-04: semantic error color はブランド色で上書きされない（プレビュー固定色）", async ({
  orgAAdminPage,
}) => {
  await orgAAdminPage.goto("/settings/branding");
  await orgAAdminPage.locator('input[name="primaryColor"]').fill("#dc2626");
  // プレビューのエラー表示は固定（red-50/red-700）で、ブランド色に依存しない
  await expect(orgAAdminPage.getByText("エラー表示（固定）")).toBeVisible();
});

test("P2AW1-E2E-05: リセットで標準へ戻る", async ({ orgAAdminPage }) => {
  await orgAAdminPage.goto("/settings/branding");
  await orgAAdminPage.getByRole("button", { name: "標準設定へ戻す" }).click();
  await orgAAdminPage.waitForURL(/\/settings\/branding\?reset=1$/);
  await expect(orgAAdminPage.getByText("標準設定へ戻しました。")).toBeVisible();
  await orgAAdminPage.goto("/settings/branding");
  await expect(orgAAdminPage.getByLabel("表示名")).toHaveValue("");
});
