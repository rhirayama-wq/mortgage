/**
 * Phase 2A: 業務関数が返すエラートークンのアプリ層分類。
 * 内部詳細・PII・secret を露出せず、一般化した分類のみを扱う。
 * 正本は 0002_phase2a_customer_cases.sql / 0003_phase2a2_applicant_profile.sql の RAISE メッセージ。
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
  "customer_case_not_inputtable",
  "customer_case_invalid_transition",
  "invitation_not_found",
  "invitation_not_open",
  "invitation_expired",
  "invite_email_mismatch",
  "participant_conflict",
  // Phase 2A-2a: 基本情報(PII)保存
  "case_applicant_not_found",
  "applicant_not_active",
  "invalid_profile_email",
  "invalid_profile_birth_date",
  "invalid_profile_field",
  // Phase 2A-3a: 勤務・収入情報(財務)保存
  "invalid_employment_income_field",
  "invalid_employment_started_on",
  "invalid_annual_income",
] as const;

export type CustomerCaseErrorCode = (typeof CUSTOMER_CASE_ERROR_CODES)[number];

/**
 * 業務関数の例外メッセージから既知エラーコードを抽出する。
 * 未知の場合は "unexpected_error"（内部詳細は返さない）。
 * 注意: 部分一致のため、より限定的なコードを先に並べる。
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

/**
 * 画面/Server Action が扱う「安全なエラーコード」（内部 DB トークンを外へ出さない）。
 * SQLSTATE / SQL / テーブル名 / RPC 内部名 は一切含めない。
 */
export const SAFE_CASE_ERROR_CODES = [
  "validation_error",
  "not_authenticated",
  "not_authorized",
  "not_found",
  "duplicate_active_invitation",
  "invitation_expired",
  "invitation_email_mismatch",
  "invitation_already_accepted",
  "data_access_error",
  "unexpected_error",
] as const;

export type SafeCaseErrorCode = (typeof SAFE_CASE_ERROR_CODES)[number];

/** DB 業務関数トークン → 安全な公開エラーコードへの写像。 */
export function toSafeCaseError(
  message: string | null | undefined,
): SafeCaseErrorCode {
  const code = classifyCustomerCaseError(message);
  switch (code) {
    case "not_authorized":
      return "not_authorized";
    case "invite_email_mismatch":
      return "invitation_email_mismatch";
    case "invitation_expired":
      return "invitation_expired";
    case "invitation_not_open":
      return "invitation_already_accepted";
    case "primary_applicant_already_exists":
      return "duplicate_active_invitation";
    case "customer_case_not_found":
    case "invitation_not_found":
    case "case_applicant_not_found":
      return "not_found";
    case "invalid_case_name":
    case "invalid_desired_price":
    case "invalid_assigned_membership":
    case "invalid_email":
    case "invalid_expiry":
    case "invalid_profile_email":
    case "invalid_profile_birth_date":
    case "invalid_profile_field":
    case "invalid_employment_income_field":
    case "invalid_employment_started_on":
    case "invalid_annual_income":
    case "customer_case_not_open":
    case "customer_case_not_inputtable":
    case "customer_case_invalid_transition":
    case "applicant_not_active":
      return "validation_error";
    case "participant_conflict":
      return "not_authorized";
    default:
      return "unexpected_error";
  }
}
