/**
 * Phase 2A-1: 業務関数が返すエラートークンのアプリ層分類。
 * 内部詳細・PII・secret を露出せず、一般化した分類のみを扱う。
 * 正本は 0002_phase2a_customer_cases.sql の RAISE メッセージ。
 */

export const CUSTOMER_CASE_ERROR_CODES = [
  "not_authorized",
  "invalid_case_name",
  "invalid_desired_price",
  "invalid_assigned_membership",
  "invalid_email",
  "invalid_expiry",
  "primary_applicant_already_exists",
  "customer_case_not_found",
  "customer_case_not_open",
  "customer_case_invalid_transition",
  "invitation_not_found",
  "invitation_not_open",
  "invitation_expired",
  "invite_email_mismatch",
  "participant_conflict",
] as const;

export type CustomerCaseErrorCode = (typeof CUSTOMER_CASE_ERROR_CODES)[number];

/**
 * 業務関数の例外メッセージから既知エラーコードを抽出する。
 * 未知の場合は "unexpected_error"（内部詳細は返さない）。
 */
export function classifyCustomerCaseError(
  message: string | null | undefined,
): CustomerCaseErrorCode | "unexpected_error" {
  if (typeof message !== "string") return "unexpected_error";
  for (const code of CUSTOMER_CASE_ERROR_CODES) {
    if (message.includes(code)) return code;
  }
  return "unexpected_error";
}
