/**
 * E2E（Playwright）— 実Supabaseローカル環境前提のシナリオ定義。
 * 実行には `supabase start`（Docker）と `.env.local` 設定が必要。
 * SUPABASE_LOCAL 環境が無い場合は skip される（テストを隠さず、状態を明示する）。
 *
 * FICTIONAL / TEST ONLY: 実在メール・実顧客データを使用しない。
 */

import { test, expect } from "@playwright/test";

const hasLocalSupabase = !!process.env.E2E_SUPABASE_LOCAL;

test.describe("AUTH E2E (requires local Supabase)", () => {
  test.skip(!hasLocalSupabase, "E2E_SUPABASE_LOCAL is not set — SUPABASE_PENDING");

  test("AUTH-E2E-01: login page renders and posts to server action", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByLabel("メールアドレス")).toBeVisible();
    await page.getByLabel("メールアドレス").fill("sysadmin.fictional@example.test");
    await page.getByRole("button", { name: "ログイン用リンクを送信" }).click();
    // 登録有無を区別しない共通応答
    await expect(page.getByRole("status")).toContainText("登録されている場合");
  });

  test("AUTH-E2E-02: unauthenticated access to /cases redirects to /login", async ({
    page,
  }) => {
    await page.goto("/cases");
    await expect(page).toHaveURL(/\/login/);
  });

  test("AUTH-E2E-03: signout via GET is rejected (405)", async ({ request }) => {
    const res = await request.get("/auth/signout");
    expect(res.status()).toBe(405);
  });

  test("AUTH-E2E-04: callback rejects disallowed otp type", async ({ request }) => {
    const res = await request.get(
      "/auth/callback?token_hash=abc&type=recovery&next=/cases",
      { maxRedirects: 0 },
    );
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.headers()["location"]).toContain("/login?e=link");
  });

  test("AUTH-E2E-05: callback rejects open redirect in next", async ({ request }) => {
    const res = await request.get(
      "/auth/callback?token_hash=abc&type=magiclink&next=https://evil.example",
      { maxRedirects: 0 },
    );
    // 認証失敗 or 安全な fallback のいずれでも外部ドメインへは飛ばない
    const location = res.headers()["location"] ?? "";
    expect(location).not.toContain("evil.example");
  });
});
