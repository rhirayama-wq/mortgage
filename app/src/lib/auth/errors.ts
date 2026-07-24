/**
 * 認証・データ取得の専用エラー型（CLAUDE.md §18, §34）
 * DB / RLS / Auth の障害を「所属なし」と同一視しないための区別。
 * これらのエラーは /error（500系）へ送り、no-access へ送らない。
 */

/** Auth サービス障害（無効セッションによる通常の未認証とは区別する） */
export class AuthSessionError extends Error {
  readonly code = "AUTH_SESSION_ERROR" as const;
  constructor(message = "auth session could not be resolved") {
    super(message);
    this.name = "AuthSessionError";
  }
}

/** DB / RLS 障害。所属なしとして扱ってはならない。 */
export class DataAccessError extends Error {
  readonly code = "DATA_ACCESS_ERROR" as const;
  constructor(message = "data access failed") {
    super(message);
    this.name = "DataAccessError";
  }
}

/** データ不整合（例: profile 欠落）。fail closed で /error へ。 */
export class DataIntegrityError extends Error {
  readonly code = "DATA_INTEGRITY_ERROR" as const;
  constructor(message = "data integrity violation") {
    super(message);
    this.name = "DataIntegrityError";
  }
}
