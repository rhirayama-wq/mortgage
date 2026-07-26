/**
 * 再利用可能な「認証済み Page」フィクスチャ。
 * Phase 2 の案件・商品検索 E2E もこのファイルを import して同じ書き味で使う。
 *
 *   import { test, expect } from "../fixtures/authenticated-test";
 *   test("...", async ({ orgAMemberPage }) => { await orgAMemberPage.goto("/cases"); });
 *
 * - Cookie をテストごとに手作業で注入しない。auth-setup が生成した storageState を読むだけ。
 * - storageState が無ければ即 FAIL する（古い state の黙認・未認証での偽 PASS を防ぐ）。
 * - fixture ごとに独立した BrowserContext を作るため、ロール間で state が混ざらない。
 */

import { existsSync } from "node:fs";
import { test as base, type Browser, type Page } from "@playwright/test";
import {
  fixtureByKey,
  storageStatePath,
  type FixtureKey,
  type FixtureManifest,
} from "./identities";
import { readFixtureManifest } from "./manifest";

export interface AuthenticatedFixtures {
  systemAdminPage: Page;
  orgAAdminPage: Page;
  orgAMemberPage: Page;
  orgBAdminPage: Page;
  orgBInviteePage: Page;
  invitedPage: Page;
  suspendedPage: Page;
  leftPage: Page;
  fixtureManifest: FixtureManifest;
}

// Playwright の fixture 第2引数（一般に `use` と呼ばれる値）。
// ここでは `provide` と呼ぶ。`use(...)` という呼び出しは react-hooks/rules-of-hooks に
// React Hook 呼び出しと誤検知されるため、ルールを無効化せずに回避する。
type Provide<T> = (value: T) => Promise<void>;

function authenticatedPage(key: FixtureKey) {
  return async (
    { browser }: { browser: Browser },
    provide: Provide<Page>,
  ): Promise<void> => {
    const statePath = storageStatePath(key);
    if (!existsSync(statePath)) {
      throw new Error(
        `storageState for fixture "${key}" (${fixtureByKey(key).email}) is missing — ` +
          "the `auth-setup` project must run first (npm run e2e:local)",
      );
    }
    const context = await browser.newContext({ storageState: statePath });
    const page = await context.newPage();
    try {
      await provide(page);
    } finally {
      await context.close();
    }
  };
}

export const test = base.extend<AuthenticatedFixtures>({
  systemAdminPage: authenticatedPage("systemAdmin"),
  orgAAdminPage: authenticatedPage("orgAAdmin"),
  orgAMemberPage: authenticatedPage("orgAMember"),
  orgBAdminPage: authenticatedPage("orgBAdmin"),
  orgBInviteePage: authenticatedPage("orgBInvitee"),
  invitedPage: authenticatedPage("invited"),
  suspendedPage: authenticatedPage("suspended"),
  leftPage: authenticatedPage("left"),

  // Playwright は fixture 関数の第1引数が object destructuring であることを要求する
  // （`{}` でも可）。この fixture は他の fixture に依存しない。
  fixtureManifest: async ({}, provide) => {
    await provide(readFixtureManifest());
  },
});

export { expect } from "@playwright/test";

/** page.url() の pathname だけを取り出す小さなヘルパー。 */
export function pathnameOf(page: Page): string {
  return new URL(page.url()).pathname;
}

/**
 * 着地判定の失敗を「60 秒 timeout」ではなく「原因つきの即時 FAIL」にするための猶予時間。
 * サーバー側 redirect は goto() の解決時点で完了しているため、これはクライアント側
 * 遷移のみを待つ猶予であり、テスト全体の timeout（60s）を延長するものではない。
 */
const LANDING_GRACE_MS = 10_000;

/** 着地先 pathname から読み取れる原因（値・token・Cookie は一切含めない）。 */
const LANDING_DIAGNOSIS: Readonly<Record<string, string>> = {
  "/login":
    "認証されていない。storageState の Cookie は送られているがサーバー側セッションが無効（GoTrue のセッション失効／global signout の巻き添えを疑う）",
  "/error": "access 判定が例外で失敗した（DB 到達不可などの想定外エラー）",
  "/no-access": "有効な所属が解決できなかった（membership が active でない）",
  "/pending-invitation": "招待中（active な所属がまだ無い）",
  "/cases": "org-app 側へ振り分けられた（SYSTEM_ADMIN 判定が効いていない）",
  "/system-console": "system-console 側へ振り分けられた",
};

/**
 * `target` へ遷移し、最終的な pathname が `expected` と**厳密一致**することを検証する。
 *
 * `waitForURL("**\/x")` の glob 待ちより厳格（部分一致を許さない）で、かつ不一致時は
 * 猶予後に「実際の pathname + そこから読み取れる原因」を添えて即座に失敗する。
 * 出力するのは pathname のみで、token・Cookie 値・Magic Link URL は一切含めない。
 */
export async function expectLanding(
  page: Page,
  target: string,
  expected: string,
): Promise<void> {
  await page.goto(target);
  if (pathnameOf(page) !== expected) {
    // サーバー redirect は goto 完了時に終わっている。クライアント側遷移だけ短く待つ。
    try {
      await page.waitForURL((url) => url.pathname === expected, {
        timeout: LANDING_GRACE_MS,
      });
    } catch {
      const actual = pathnameOf(page);
      const why = LANDING_DIAGNOSIS[actual];
      throw new Error(
        `landing mismatch: goto("${target}") expected "${expected}" but landed on "${actual}"` +
          (why ? ` — ${why}` : "") +
          " [pathname only; no token/cookie is printed]",
      );
    }
  }
  const landed = pathnameOf(page);
  if (landed !== expected) {
    throw new Error(
      `landing mismatch: goto("${target}") expected "${expected}" but landed on "${landed}"`,
    );
  }
}
