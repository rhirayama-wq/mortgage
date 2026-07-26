/**
 * E2E（Playwright）— 実Supabaseローカル環境前提のシナリオ定義。
 * 実行には `supabase start`（Docker）と `.env.local` 設定が必要。
 * SUPABASE_LOCAL 環境が無い場合は skip される（テストを隠さず、状態を明示する）。
 *
 * 実行: cd app && E2E_SUPABASE_LOCAL=1 npm run e2e   （= npm run e2e:local）
 *
 * FICTIONAL / TEST ONLY: 実在メール・実顧客データを使用しない。
 *
 * 秘密情報の非露出（CLAUDE.md §23）:
 *   - Magic Link の token_hash・Cookie 値・JWT をログ／アサーション差分へ出さない。
 *   - Mailpit 本文はリンク抽出と固定文言判定にのみ使用し、本文・token をそのまま出力しない。
 *
 * メール送信レート（config.toml auth.rate_limit.email_sent）対策:
 *   - Magic Link 送信は AUTH-E2E-06 の 1 回のみ（他テストは送信しない）。
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { MAGIC_LINK_LIFECYCLE_EMAIL } from "./fixtures/identities";

const hasLocalSupabase = !!process.env.E2E_SUPABASE_LOCAL;
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
// AUTH-E2E-06 専用の架空ユーザー（seed.sql が作る登録済みメール）。
// SYSTEM_ADMIN fixture とは意図的に別ユーザー: 本テストの signout は
// supabase.auth.signOut() の既定 scope "global" でそのユーザーの全セッションを
// 失効させるため、fixture と共有すると auth-setup 発行の storageState を壊す。
const LIFECYCLE_EMAIL = MAGIC_LINK_LIFECYCLE_EMAIL;
// カスタムテンプレート固有値（supabase/templates/magic_link.html）
const TEMPLATE_SUBJECT = "ログイン用リンク";
const TEMPLATE_MARKER = "心当たりがない場合"; // 本文固有の固定文言

// --- Mailpit ヘルパー（token・本文をログしない） ---------------------------
interface MailpitAddress {
  Address?: string;
}
interface MailpitListItem {
  ID: string;
  To?: MailpitAddress[];
  Subject?: string;
}
interface MailpitList {
  messages?: MailpitListItem[];
}
interface MailpitMessage {
  Subject?: string;
  HTML?: string;
  Text?: string;
}

/** 受信箱を空にする。DELETE 応答を確認し、失敗時は fail closed（過去メールの偽陽性防止）。 */
async function clearMailpit(request: APIRequestContext): Promise<void> {
  const res = await request.delete(`${MAILPIT_URL}/api/v1/messages`);
  if (!res.ok()) {
    throw new Error(`Mailpit clear failed: HTTP ${res.status()}`);
  }
}

interface MagicLinkMail {
  subject: string;
  templateOk: boolean;
  linkPath: string; // token_hash を含む — ログ／assert 差分へ出さないこと
}

/**
 * 指定宛先の Magic Link メールを取得する。
 * 検索は宛先アドレスのみで行い（clearMailpit 済みのため一意）、件名・固定文言は
 * 返り値に載せてテスト本体（B7）のアサーションで検証する — 件名不一致を
 * 「タイムアウト」に畳み込まず、明確な assert 失敗として表面化させるため。
 * 返り値の linkPath は token_hash を含むためログしない。
 * タイムアウト時は宛先一致メールの件数のみ表示（本文・件名・token は出さない）。
 */
async function waitForMagicLink(
  request: APIRequestContext,
  toAddress: string,
): Promise<MagicLinkMail> {
  const deadline = Date.now() + 15_000;
  let seenForRecipient = 0;
  while (Date.now() < deadline) {
    const listRes = await request.get(
      `${MAILPIT_URL}/api/v1/messages?limit=50`,
    );
    if (listRes.ok()) {
      const list: MailpitList = await listRes.json();
      const hits = (list.messages ?? []).filter((m) =>
        (m.To ?? []).some(
          (t) => (t.Address ?? "").toLowerCase() === toAddress.toLowerCase(),
        ),
      );
      seenForRecipient = hits.length;
      for (const hit of hits) {
        const msgRes = await request.get(
          `${MAILPIT_URL}/api/v1/message/${hit.ID}`,
        );
        if (msgRes.ok()) {
          const msg: MailpitMessage = await msgRes.json();
          const html = String(msg.HTML ?? msg.Text ?? "");
          const match = html.match(/\/auth\/callback\?token_hash=[^"'\s<>]+/);
          if (match) {
            return {
              subject: String(msg.Subject ?? hit.Subject ?? ""),
              templateOk: html.includes(TEMPLATE_MARKER),
              linkPath: match[0].replace(/&amp;/g, "&"),
            };
          }
        }
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  // 件数のみの安全な診断: 0 なら送信失敗/未配達、>0 ならリンク抽出失敗を示す
  throw new Error(
    `magic link email did not arrive in Mailpit within timeout ` +
      `(messages for recipient: ${seenForRecipient})`,
  );
}

test.describe("AUTH E2E (requires local Supabase)", () => {
  test.skip(
    !hasLocalSupabase,
    "E2E_SUPABASE_LOCAL is not set — SUPABASE_PENDING",
  );

  test("AUTH-E2E-01: login page renders with email form (no email sent)", async ({
    page,
  }) => {
    // 描画・フォーム存在確認のみ（送信しない = メールを消費しない）
    await page.goto("/login");
    await expect(page.getByLabel("メールアドレス")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ログイン用リンクを送信" }),
    ).toBeVisible();
  });

  test("AUTH-E2E-02: unauthenticated access to /cases redirects to /login", async ({
    page,
  }) => {
    await page.goto("/cases");
    await expect(page).toHaveURL(/\/login/);
  });

  test("AUTH-E2E-03 (B12: GET): signout via GET is rejected (405)", async ({
    request,
  }) => {
    const res = await request.get("/auth/signout", { maxRedirects: 0 });
    expect(res.status()).toBe(405);
  });

  test("AUTH-E2E-04: callback rejects disallowed otp type", async ({
    request,
  }) => {
    const res = await request.get(
      "/auth/callback?token_hash=abc&type=recovery&next=/cases",
      { maxRedirects: 0 },
    );
    // 3xx リダイレクトであることを要求する（>=300 だけでは 4xx/5xx がすり抜けるため）。
    // 失敗時に実 status を表示する（status は秘密情報ではない）。
    const status = res.status();
    expect(status, `callback responded ${status}`).toBeGreaterThanOrEqual(300);
    expect(status, `callback responded ${status} (expected 3xx)`).toBeLessThan(
      400,
    );
    expect(
      res.headers()["location"] ?? "",
      "redirects to /login?e=link",
    ).toContain("/login?e=link");
  });

  test("AUTH-E2E-05: callback rejects open redirect in next", async ({
    request,
  }) => {
    const res = await request.get(
      "/auth/callback?token_hash=abc&type=magiclink&next=https://evil.example",
      { maxRedirects: 0 },
    );
    // 無効 token での verifyOtp 失敗 → 3xx で /login?e=link（500 は契約違反として検出する）
    const status = res.status();
    expect(status, `callback responded ${status}`).toBeGreaterThanOrEqual(300);
    expect(status, `callback responded ${status} (expected 3xx)`).toBeLessThan(
      400,
    );
    const location = res.headers()["location"] ?? "";
    expect(location, "no external redirect").not.toContain("evil.example");
    expect(location, "falls back to local /login").toContain("/login");
  });

  test("AUTH-E2E-06 (B6/B7/B8/B11/B12 + B10 session): magic link lifecycle + authenticated signout", async ({
    page,
    context,
    request,
  }) => {
    // B6: /login からサーバー経由で送信（登録有無を区別しない共通応答）
    await clearMailpit(request);
    await page.goto("/login");
    await page.getByLabel("メールアドレス").fill(LIFECYCLE_EMAIL);
    await page.getByRole("button", { name: "ログイン用リンクを送信" }).click();
    await expect(page.getByRole("status")).toContainText("登録されている場合");

    // B7: 件名・カスタムテンプレート固定文言・callback リンク形状を検証（token/本文は出力しない）
    const mail = await waitForMagicLink(request, LIFECYCLE_EMAIL);
    expect(mail.subject, "subject == custom template subject").toBe(
      TEMPLATE_SUBJECT,
    );
    expect(mail.templateOk, "custom template fixed text present").toBe(true);
    const shapeOk = /^\/auth\/callback\?token_hash=[^&]+&type=email$/.test(
      mail.linkPath,
    );
    // 生 token をアサーション差分へ出さないため boolean で検証する
    expect(shapeOk, "callback link uses token_hash + type=email").toBe(true);

    // 初回オープンでログイン成立（未認証ページへ戻されない）
    await page.goto(mail.linkPath);
    await expect(page).not.toHaveURL(/\/login/);

    // B11: 認証 Cookie 属性（値・名前はログ／メッセージに出さない）。
    //      `sb-...-auth-token`（チャンク分割含む）を全件抽出し、1 件以上・全件が
    //      httpOnly=true / path=/ / sameSite=Lax であることを確認。callback redirect 後も存在すること。
    //      secure はローカル HTTP では false のため固定 assert しない（本番=HTTPS で true）。
    const authCookies = (await context.cookies()).filter(
      (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"),
    );
    expect(
      authCookies.length,
      "at least one sb auth-token cookie after callback",
    ).toBeGreaterThan(0);
    for (const c of authCookies) {
      expect(c.httpOnly, "auth cookie httpOnly").toBe(true);
      expect(c.path, "auth cookie path=/").toBe("/");
      expect(c.sameSite, "auth cookie sameSite=Lax").toBe("Lax");
    }

    // B10（セッション維持のみ / middleware token refresh の強制ではない → docs で PENDING）:
    //   別リクエストでも未認証へ戻らないこと（＝有効セッションが維持される）を確認する。
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login/);

    // B8: 同一リンクの再利用は拒否（session を持たない clean client で 2 回目 → /login?e=link）
    const reuse = await request.get(mail.linkPath, { maxRedirects: 0 });
    expect(reuse.status()).toBeGreaterThanOrEqual(300);
    expect(reuse.headers()["location"] ?? "").toContain("/login?e=link");

    // B12: ログイン済みの同一 context から signout POST（page.request は context の Cookie を共有）
    const out = await page.request.post("/auth/signout", { maxRedirects: 0 });
    expect(out.status(), "signout POST 303").toBe(303);
    expect(
      out.headers()["location"] ?? "",
      "signout redirects to /login",
    ).toContain("/login");
    // signout 後: 認証 Cookie が削除/無効化されている（値を持つ auth-token Cookie が 0 件）
    const remainingAuth = (await context.cookies()).filter(
      (c) =>
        c.name.startsWith("sb-") &&
        c.name.includes("-auth-token") &&
        c.value.length > 0,
    );
    expect(
      remainingAuth.length,
      "auth-token cookies with a value cleared after signout",
    ).toBe(0);
    // signout 後は保護ルートへ入れず /login へ戻る
    await page.goto("/cases");
    await expect(page).toHaveURL(/\/login/);
  });

  test("AUTH-E2E-07 (aux, not B12 completion): unauthenticated signout POST returns 303", async ({
    request,
  }) => {
    const res = await request.post("/auth/signout", { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(res.headers()["location"] ?? "").toContain("/login");
  });

  // B9（招待先メール一致・他人の accept 拒否）は verify-supabase.ts の B9-reject /
  // B9-state-intact / B9-no-forged-audit（実 Supabase 統合）で担保する。
  // DB 層は FUNC-03 (PG_HARNESS_PASS)。ここでは test.skip を置かない。
});
