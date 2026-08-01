/**
 * P2A2-E2E — 顧客案件スライスの実機 E2E（実 HTTP・実 Cookie・実 Supabase local）。
 * FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
 *
 * 対象フロー（Phase 2A-2a）:
 *  1. 営業(active member)が案件を作成し、顧客を招待する
 *  2. 顧客が Magic Link ログイン後に招待を受諾する（organization membership なし）
 *  3. 顧客が自分の案件だけを閲覧し、基本情報をオートセーブする（再読込で保存が残る）
 *  3b. 顧客が勤務・収入情報をオートセーブする（再読込で保存が残る・完了表示）
 *  3c. スタッフは勤務・収入の「進捗」のみ見え、入力値（勤務先名等）は見えない
 *  4. 顧客は法人アプリ(/cases)へ入れない（membership が無い＝ /no-access）
 *
 * 設計:
 *  - 顧客セッションは共有 storageState fixture を汚さないよう、本 spec 内で
 *    GoTrue Admin API の magic link + 実 /auth/callback から都度生成する
 *    （auth.setup.ts と同じ経路。既存 AUTH E2E の identities/fixtures は変更しない）。
 *  - 期待結果の根拠: src/app/(customer-app)/** と src/lib/auth/require.ts（顧客は認証のみ）。
 *  - フレッシュな local DB（supabase db reset 後の e2e:local）を前提にする。
 */

import { test, expect } from "../fixtures/authenticated-test";
import {
  assertLoopback,
  loadDotEnvLocal,
  requireEnv,
} from "../fixtures/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Browser, BrowserContext, Page } from "@playwright/test";

const hasLocalSupabase = !!process.env.E2E_SUPABASE_LOCAL;

test.skip(
  !hasLocalSupabase,
  "E2E_SUPABASE_LOCAL is not set — 顧客案件 E2E は SUPABASE_PENDING",
);

const CUSTOMER_EMAIL = "e2e.customer.p2a2@example.test";

const NOAUTH = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

function admin(): SupabaseClient {
  loadDotEnvLocal();
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  assertLoopback(url);
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey, NOAUTH);
}

/** 架空の顧客ユーザーを冪等に用意する（membership は付けない）。 */
async function ensureCustomerUser(a: SupabaseClient, email: string): Promise<void> {
  const created = await a.auth.admin.createUser({ email, email_confirm: true });
  if (!created.error) return;
  // 既存の場合は無視（listUsers での存在確認は E2E では省略）。
}

/** 実 /auth/callback 経路で顧客の認証済みコンテキストを作る。 */
async function customerSignIn(
  browser: Browser,
  a: SupabaseClient,
  email: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const link = await a.auth.admin.generateLink({ type: "magiclink", email });
  const hash = link.data?.properties?.hashed_token;
  if (link.error || !hash) {
    throw new Error("generateLink failed for customer fixture");
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(
    `/auth/callback?token_hash=${encodeURIComponent(hash)}&type=email`,
  );
  await page.waitForLoadState("domcontentloaded");
  if (new URL(page.url()).pathname.startsWith("/login")) {
    await context.close();
    throw new Error("customer magic link callback did not authenticate");
  }
  return { context, page };
}

test("P2A2-E2E-01: 営業が案件作成→顧客招待、顧客が受諾し基本情報をオートセーブ、再読込で保持", async ({
  orgAMemberPage,
  browser,
}) => {
  const a = admin();
  await ensureCustomerUser(a, CUSTOMER_EMAIL);

  const caseName = `P2A2 E2E 案件 ${Date.now()}`;

  // --- 営業: 案件作成＋主申込者招待 ---
  // 現行の /cases/new は「案件名＋顧客メール（必須）」で案件作成と主申込者招待を一体で行う。
  // SALES_USER の担当営業は hidden の自己割当（選択不要）。希望物件価格は任意。
  await orgAMemberPage.goto("/cases/new");
  await orgAMemberPage.getByLabel("案件名").fill(caseName);
  await orgAMemberPage.locator('input[name="customerEmail"]').fill(CUSTOMER_EMAIL);
  await orgAMemberPage.getByRole("button", { name: "案件を作成して招待" }).click();
  // 作成成功で /cases/[uuid]?invited=1 へ遷移し、招待作成の成功が表示される（二重招待はしない）。
  await orgAMemberPage.waitForURL(/\/cases\/[0-9a-f-]{36}\?invited=1$/);
  await expect(orgAMemberPage.getByText("招待を作成しました。")).toBeVisible();
  const caseId = new URL(orgAMemberPage.url()).pathname.split("/").pop() as string;

  // --- 顧客: ログイン→保留中招待を全て受諾 ---
  const { context, page } = await customerSignIn(browser, a, CUSTOMER_EMAIL);
  try {
    await page.goto("/customer/cases");
    // フレッシュ DB では保留中招待は 1 件。念のため残っている分は全て受諾する。
    for (let i = 0; i < 5; i += 1) {
      const confirm = page.getByRole("link", { name: "内容を確認" });
      if ((await confirm.count()) === 0) break;
      await confirm.first().click();
      await page.getByRole("button", { name: "招待を受諾" }).click();
      await page.waitForURL(/\/customer\/cases/);
    }

    // 参加中の案件に、作成した案件が出る
    const caseLink = page.getByRole("link", { name: caseName });
    await expect(caseLink).toBeVisible();
    await caseLink.click();
    await page.waitForURL(/\/customer\/cases\/[0-9a-f-]{36}$/);

    // 基本情報入力へ
    await page.getByRole("link", { name: "基本情報を入力する" }).click();
    await page.waitForURL(/\/profile$/);

    // 氏名を入力 → 今すぐ保存 → 保存済み表示
    await page.getByLabel("氏名", { exact: true }).fill("架空 花子");
    await page.getByRole("button", { name: "今すぐ保存" }).click();
    await expect(page.getByTestId("autosave-status")).toContainText("保存しました");

    // 再読込で保持されている（サーバー保存の確認）
    await page.reload();
    await expect(page.getByLabel("氏名", { exact: true })).toHaveValue("架空 花子");

    // --- 勤務・収入情報のオートセーブ（2 ステップ导线の 2 番目） ---
    await page.goto(`/customer/cases/${caseId}`);
    await page.getByRole("link", { name: "勤務・収入情報を入力する" }).click();
    await page.waitForURL(/\/employment-income$/);

    await page.getByLabel("雇用形態").selectOption("full_time");
    await page.getByLabel("勤務先名").fill("架空商事株式会社");
    await page.getByLabel("入社年月").fill("2018-04");
    await page.getByLabel("年収（額面・円）").fill("6000000");
    await page.getByLabel("収入区分").selectOption("salary");
    await page.getByRole("button", { name: "今すぐ保存" }).click();
    await expect(page.getByTestId("autosave-status")).toContainText("保存しました");
    await expect(page.getByTestId("employment-income-completeness")).toContainText(
      "すべて入力",
    );

    // 再読込で保持されている
    await page.reload();
    await expect(page.getByLabel("勤務先名")).toHaveValue("架空商事株式会社");
  } finally {
    await context.close();
  }

  // --- スタッフ側: 勤務・収入は「進捗」のみ見え、入力値は見えない ---
  await orgAMemberPage.goto(`/cases/${caseId}`);
  const staffEI = orgAMemberPage.getByTestId("staff-employment-income").first();
  await expect(staffEI).toContainText("勤務・収入: 完了");
  // 顧客が入力した勤務先名（値）はスタッフ画面に一切出ない。
  await expect(orgAMemberPage.getByText("架空商事株式会社")).toHaveCount(0);
});

test("P2A2-E2E-02: 顧客(membership なし)は法人アプリ /cases に入れず /no-access、ポータルは開ける", async ({
  browser,
}) => {
  const a = admin();
  await ensureCustomerUser(a, CUSTOMER_EMAIL);

  const { context, page } = await customerSignIn(browser, a, CUSTOMER_EMAIL);
  try {
    // 顧客ポータルは開ける
    await page.goto("/customer/cases");
    await expect(page.getByText("マイページ")).toBeVisible();

    // 法人アプリ /cases へは membership が無いため入れない（/no-access）
    await page.goto("/cases");
    await page.waitForURL(/\/no-access$/);
  } finally {
    await context.close();
  }
});
