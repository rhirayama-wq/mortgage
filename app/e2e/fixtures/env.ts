/**
 * E2E 認証基盤: ローカル専用の環境変数ロードと「秘密を含まない」エラー整形。
 * FICTIONAL / LOCAL ONLY / PRODUCTION USE PROHIBITED（CLAUDE.md §32）
 *
 * - `.env.local` の値そのもの（URL / anon key / service role key）は絶対にログへ出さない（§23）
 * - Supabase host が loopback でなければ実行を拒否する（本番接続禁止）
 * - エラーは name / status / code のみを取り出して報告する
 *   （error.message 全文は URL・JWT・token_hash を含み得るため出さない）
 *
 * 実装は scripts/verify-supabase.ts の同等ヘルパーと意図的に同じ方針を取る。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** テストプロセスへ .env.local を読み込む（既存の process.env を上書きしない）。 */
export function loadDotEnvLocal(): void {
  for (const candidate of [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "app", ".env.local"),
    resolve(__dirname, "..", "..", ".env.local"),
  ]) {
    let raw: string;
    try {
      raw = readFileSync(candidate, "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
    return;
  }
}

/** 値はログへ出さず、欠落時は変数名のみで失敗させる。 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`required environment variable is missing: ${name}`);
  }
  return value;
}

/** loopback 以外の Supabase を指していたら実行を拒否する（本番接続禁止）。 */
export function assertLoopback(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL");
  }
  const loopback = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (!loopback.has(host)) {
    throw new Error(
      `refusing to run against non-loopback host "${host}" — e2e auth setup is local-only (CLAUDE.md §32)`,
    );
  }
}

/**
 * エラーから秘密値を含まない識別子だけを取り出す。
 * 出すのは name / HTTP status / code / cause.name / cause.code のみ。
 */
export function describeError(e: unknown): string {
  const parts: string[] = [];
  if (e && typeof e === "object") {
    const o = e as {
      name?: unknown;
      status?: unknown;
      code?: unknown;
      cause?: unknown;
    };
    if (typeof o.name === "string") parts.push(`name=${o.name}`);
    if (typeof o.status === "number") parts.push(`status=${o.status}`);
    if (typeof o.code === "string") parts.push(`code=${o.code}`);
    if (o.cause && typeof o.cause === "object") {
      const c = o.cause as { name?: unknown; code?: unknown };
      if (typeof c.name === "string") parts.push(`cause.name=${c.name}`);
      if (typeof c.code === "string") parts.push(`cause.code=${c.code}`);
    }
  }
  return parts.length > 0 ? parts.join(" ") : "no-safe-detail";
}

/** PostgREST / RPC エラーの安全な要約（message 全文は出さない）。 */
export function describePostgrestError(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { code?: unknown; message?: unknown };
    if (typeof o.code === "string" && o.code.length > 0) return `code=${o.code}`;
    // DB 業務関数が raise する識別子は秘密を含まない固定文字列のみ許可する
    if (typeof o.message === "string") {
      const known = KNOWN_DB_ERRORS.find((k) => o.message === k || String(o.message).includes(k));
      if (known) return `db=${known}`;
    }
  }
  return "no-safe-detail";
}

/** DB 業務関数が raise する既知の識別子（秘密を含まない固定文字列）。 */
export const KNOWN_DB_ERRORS = [
  "not_authorized",
  "membership_not_found",
  "membership_already_exists",
  "membership_invalid_transition",
  "membership_left_terminal",
  "membership_role_change_requires_active",
  "invite_email_mismatch",
  "invited_user_not_found",
  "organization_not_found_or_archived",
  "last_organization_admin_protected",
] as const;
