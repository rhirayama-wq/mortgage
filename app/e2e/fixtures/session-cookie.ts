/**
 * B10-refresh 用: Supabase SSR 認証 Cookie（`sb-*-auth-token`）を安全に読み書きする
 * E2E ヘルパー。FICTIONAL / LOCAL ONLY / PRODUCTION USE PROHIBITED（CLAUDE.md §32）
 *
 * 目的:
 *  - access token を「期限切れ相当」へ強制する（`expires_at` を過去へ書き換える）。
 *    実際の期限切れと同じく、@supabase/ssr の server client / middleware の
 *    `getUser()` が保存済み `expires_at` を見て refresh token による更新を行う
 *    正規経路をそのまま通す（JWT の偽造・署名改変はしない）。
 *  - refresh token を無効化し、「refresh 不能時の安全な失敗」を再現する。
 *
 * Cookie 形式（@supabase/ssr 0.6 系）:
 *  - 値は `base64-` prefix + base64url(JSON セッション)。
 *  - 3180 文字を超える場合は `sb-...-auth-token.0`, `.1`, ... にチャンク分割される。
 *  - 本ヘルパーは分割の有無どちらも扱い、書き戻し時も同じ形式・同じ属性を維持する。
 *
 * セキュリティ（CLAUDE.md §23）:
 *  - token / Cookie 値 / storageState 内容 / JWT を **絶対にログ・エラーメッセージへ
 *    含めない**。エラーは固定文言と件数のみ。
 *  - SessionSnapshot はメモリ上の比較専用。テスト側は boolean へ畳んでから
 *    assert し、値そのものを expect のメッセージや console へ渡さないこと。
 */

import { Buffer } from "node:buffer";
import type { BrowserContext } from "@playwright/test";

type Cookie = Awaited<ReturnType<BrowserContext["cookies"]>>[number];

const AUTH_COOKIE_RE = /^(sb-.*-auth-token)(?:\.(\d+))?$/;
const BASE64_PREFIX = "base64-";
/** @supabase/ssr の chunker と同じ 1 Cookie あたりの value 最大長。 */
const MAX_CHUNK_SIZE = 3180;

/** Cookie に保存されるセッション JSON のうち、本ヘルパーが扱うフィールド。 */
interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user?: { id?: string };
  [key: string]: unknown;
}

/**
 * 比較専用のセッションスナップショット。
 * **値を expect のメッセージ・console・エラーへ渡さないこと**（boolean 比較のみに使う）。
 */
export interface SessionSnapshot {
  readonly userId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  /** unix 秒。 */
  readonly expiresAt: number;
  readonly cookieCount: number;
  readonly allHttpOnly: boolean;
}

interface ParsedAuthCookies {
  baseName: string;
  /** チャンク順に並べた実 Cookie（属性の書き戻しテンプレートを兼ねる）。 */
  cookies: Cookie[];
  encoding: "base64url" | "raw";
  session: StoredSession;
}

function decodePayload(joined: string): { encoding: "base64url" | "raw"; json: string } {
  if (joined.startsWith(BASE64_PREFIX)) {
    return {
      encoding: "base64url",
      json: Buffer.from(joined.slice(BASE64_PREFIX.length), "base64url").toString("utf8"),
    };
  }
  // 旧形式（URI エンコードされた素の JSON）へのフォールバック
  return { encoding: "raw", json: decodeURIComponent(joined) };
}

function encodePayload(encoding: "base64url" | "raw", json: string): string {
  if (encoding === "base64url") {
    return BASE64_PREFIX + Buffer.from(json, "utf8").toString("base64url");
  }
  return encodeURIComponent(json);
}

async function readAuthCookies(context: BrowserContext): Promise<ParsedAuthCookies> {
  const all = await context.cookies();
  const grouped = new Map<string, { index: number; cookie: Cookie }[]>();
  for (const cookie of all) {
    const match = AUTH_COOKIE_RE.exec(cookie.name);
    if (!match) continue;
    const baseName = match[1];
    const index = match[2] === undefined ? 0 : Number(match[2]);
    const list = grouped.get(baseName) ?? [];
    list.push({ index, cookie });
    grouped.set(baseName, list);
  }

  if (grouped.size === 0) {
    throw new Error(
      "supabase auth cookie (sb-*-auth-token) not found in browser context",
    );
  }
  if (grouped.size > 1) {
    throw new Error(
      `expected exactly one supabase auth cookie group but found ${grouped.size}`,
    );
  }

  const [baseName, entries] = [...grouped.entries()][0];
  entries.sort((a, b) => a.index - b.index);
  const joined = entries.map((e) => e.cookie.value).join("");

  let session: StoredSession;
  let encoding: "base64url" | "raw";
  try {
    const decoded = decodePayload(joined);
    encoding = decoded.encoding;
    session = JSON.parse(decoded.json) as StoredSession;
  } catch {
    // 値・decode 途中経過はエラーへ含めない（固定文言のみ）
    throw new Error(
      "supabase auth cookie payload could not be decoded as a session JSON",
    );
  }

  if (
    typeof session.access_token !== "string" ||
    typeof session.refresh_token !== "string" ||
    typeof session.expires_at !== "number" ||
    typeof session.user?.id !== "string"
  ) {
    throw new Error(
      "supabase auth session JSON is missing required fields " +
        "(access_token / refresh_token / expires_at / user.id)",
    );
  }

  return { baseName, cookies: entries.map((e) => e.cookie), encoding, session };
}

async function writeAuthCookies(
  context: BrowserContext,
  parsed: ParsedAuthCookies,
  nextSession: StoredSession,
): Promise<void> {
  const encoded = encodePayload(parsed.encoding, JSON.stringify(nextSession));

  const chunks: { name: string; value: string }[] = [];
  if (encoded.length <= MAX_CHUNK_SIZE) {
    chunks.push({ name: parsed.baseName, value: encoded });
  } else {
    for (let i = 0; i * MAX_CHUNK_SIZE < encoded.length; i += 1) {
      chunks.push({
        name: `${parsed.baseName}.${i}`,
        value: encoded.slice(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE),
      });
    }
  }

  // 旧チャンクを取り残さないよう、いったん auth cookie 群のみ削除して書き直す
  await context.clearCookies({ name: AUTH_COOKIE_RE });

  const template = parsed.cookies[0];
  await context.addCookies(
    chunks.map((chunk) => ({
      name: chunk.name,
      value: chunk.value,
      domain: template.domain,
      path: template.path,
      expires: template.expires,
      httpOnly: template.httpOnly,
      secure: template.secure,
      sameSite: template.sameSite,
    })),
  );
}

/** 現在の認証セッションの比較用スナップショットを取得する（値はログへ出さない）。 */
export async function captureAuthSessionSnapshot(
  context: BrowserContext,
): Promise<SessionSnapshot> {
  const parsed = await readAuthCookies(context);
  return {
    userId: String(parsed.session.user?.id),
    accessToken: parsed.session.access_token,
    refreshToken: parsed.session.refresh_token,
    expiresAt: parsed.session.expires_at,
    cookieCount: parsed.cookies.length,
    allHttpOnly: parsed.cookies.every((c) => c.httpOnly),
  };
}

/** 現在時刻（unix 秒）。expires_at との前後比較にのみ使う。 */
export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * access token だけを「期限切れ相当」にする。
 * 実際の期限切れと同じく `expires_at` の経過のみを再現し、access token /
 * refresh token の値そのものには触れない（署名不正 JWT を作らない）。
 */
export async function forceAccessTokenExpiry(context: BrowserContext): Promise<void> {
  const parsed = await readAuthCookies(context);
  const next: StoredSession = {
    ...parsed.session,
    expires_at: nowInSeconds() - 3600,
  };
  await writeAuthCookies(context, parsed, next);

  // 書換えが実際に適用されたことを読み戻して確認（適用失敗の偽 PASS を防ぐ）
  const readback = await readAuthCookies(context);
  if (readback.session.expires_at >= nowInSeconds()) {
    throw new Error("forceAccessTokenExpiry did not persist the past expires_at");
  }
  if (readback.session.refresh_token !== parsed.session.refresh_token) {
    throw new Error("forceAccessTokenExpiry must not modify the refresh token");
  }
}

/**
 * refresh 不能状態を再現する: access token を期限切れ相当にした上で、
 * refresh token を GoTrue に存在しない無効値へ置き換える。
 * （実在した token を再利用しないため、既存セッションファミリーの失効を誘発しない）
 */
export async function invalidateRefreshToken(context: BrowserContext): Promise<void> {
  const parsed = await readAuthCookies(context);
  const next: StoredSession = {
    ...parsed.session,
    expires_at: nowInSeconds() - 3600,
    refresh_token: "invalid-refresh-token-for-e2e",
  };
  await writeAuthCookies(context, parsed, next);

  const readback = await readAuthCookies(context);
  if (
    readback.session.refresh_token !== "invalid-refresh-token-for-e2e" ||
    readback.session.expires_at >= nowInSeconds()
  ) {
    throw new Error("invalidateRefreshToken did not persist the broken session");
  }
}
