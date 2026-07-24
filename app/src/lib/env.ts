/**
 * 環境変数アクセス（CLAUDE.md §23: service role key を NEXT_PUBLIC_ に置かない）
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    // 値そのものはログへ出さない
    throw new Error(`required environment variable is missing: ${name}`);
  }
  return value;
}

export function supabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/** サーバー専用。クライアントバンドルから参照してはならない。 */
export function supabaseServiceRoleKey(): string {
  if (typeof window !== "undefined") {
    throw new Error("service role key must never be accessed in the browser");
  }
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

/** メールリンク等で使用する自アプリの origin（Host ヘッダを信頼しない） */
export function appOrigin(): string {
  return requireEnv("APP_ORIGIN").replace(/\/+$/, "");
}
