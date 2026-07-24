/**
 * open redirect 防止（CLAUDE.md §17 / AUTH-04..06）
 * next パラメータは「同一 origin の安全な相対パス」のみ許可する。
 * middleware -> login -> callback の全経路でこの関数を通して二重検証する。
 * 依存ゼロの純粋関数（unit test 対象）。
 */

const MAX_NEXT_LENGTH = 512;

/**
 * 安全な内部パスのみを返す。安全でない場合は fallback（既定 '/'）。
 * 許可: '/' で始まり、'//' や '\' やコントロール文字を含まない相対パス。
 * hash は破棄し、pathname + search のみ返す。
 */
export function getSafeInternalPath(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;
  if (raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return fallback;
  if (!raw.startsWith("/")) return fallback;
  // protocol-relative ('//evil.example') / バックスラッシュ変種を拒否
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (raw.includes("\\")) return fallback;
  // コントロール文字（CR/LF インジェクション等）を拒否
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;

  // URL パーサで origin が変わらないことを確認（エンコード変種対策）
  const BASE = "https://internal.invalid";
  let parsed: URL;
  try {
    parsed = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (parsed.origin !== BASE) return fallback;
  if (parsed.username !== "" || parsed.password !== "") return fallback;

  const path = parsed.pathname + parsed.search;
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}
