import { defineConfig } from "@playwright/test";

/**
 * Playwright 構成（Phase 1 / 認証済みE2E基盤）
 *
 * project は 3 つに分割する。
 *  - e2e           : 既存の未認証E2E（7件）。storageState を一切使わない。
 *  - auth-setup    : 架空fixtureの作成と storageState 生成。実Supabase local が必要。
 *  - authenticated : 生成済み storageState を再利用する認可テスト。auth-setup に依存。
 *
 * `npm run e2e:local` で 3 project すべてが順に実行される。
 * storageState は app/.auth/ 配下に生成され、.gitignore 済み（コミット禁止）。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "e2e",
      testMatch: /e2e\/auth\.spec\.ts$/,
    },
    {
      name: "auth-setup",
      testMatch: /e2e\/setup\/.*\.setup\.ts$/,
    },
    {
      name: "authenticated",
      testMatch: /e2e\/authenticated\/.*\.spec\.ts$/,
      dependencies: ["auth-setup"],
    },
  ],
  webServer: process.env.E2E_SUPABASE_LOCAL
    ? {
        command: "npm run dev",
        url: "http://localhost:3000/login",
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
});
