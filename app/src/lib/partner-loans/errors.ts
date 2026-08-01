/**
 * Phase 2A-2b: 提携ローン業務関数トークン → 安全な公開エラーコードへの写像。
 * 内部詳細（SQLSTATE / SQL / テーブル名 / RPC 内部名）を外へ出さない。
 * 正本は 0004_phase2b_partner_loans.sql の RAISE メッセージ。純粋・依存ゼロ。
 */

export const PARTNER_LOAN_ERROR_CODES = [
  "validation_error",
  "not_authenticated",
  "not_authorized",
  "not_found",
  "partner_loan_not_found",
  "partner_loan_inactive",
  "partner_loan_version_conflict",
  "partner_loan_invalid_period",
  "partner_loan_invalid_url",
  "partner_loan_duplicate_key",
  "data_access_error",
  "unexpected_error",
] as const;

export type PartnerLoanErrorCode = (typeof PARTNER_LOAN_ERROR_CODES)[number];

/** DB トークンから安全なコードへ。未知は unexpected_error。 */
export function toSafePartnerLoanError(
  message: string | null | undefined,
): PartnerLoanErrorCode {
  if (typeof message !== "string") return "unexpected_error";
  // より限定的なトークンを先に判定する
  if (message.includes("partner_loan_version_conflict")) {
    return "partner_loan_version_conflict";
  }
  if (message.includes("partner_loan_invalid_url")) return "partner_loan_invalid_url";
  if (message.includes("partner_loan_invalid_institution")) return "validation_error";
  if (message.includes("partner_loan_invalid_transition")) return "validation_error";
  if (message.includes("partner_loan_not_found")) return "partner_loan_not_found";
  if (message.includes("partner_loan_immutable")) return "not_authorized";
  if (
    message.includes("org_partner_loans_org_key_uniq") ||
    message.includes("duplicate key")
  ) {
    return "partner_loan_duplicate_key";
  }
  if (message.includes("oplv_period_range") || message.includes("invalid_period")) {
    return "partner_loan_invalid_period";
  }
  if (message.includes("not_authorized")) return "not_authorized";
  if (message.includes("validation_error")) return "validation_error";
  return "unexpected_error";
}
