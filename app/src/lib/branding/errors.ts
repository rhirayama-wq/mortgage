/**
 * Phase 2A-W1: ブランディング業務関数のエラートークン分類（内部詳細を露出しない）。
 * 正本は 0006_phase2aw1_organization_branding.sql の RAISE メッセージ。
 * 既存 customer-cases/partner-loans と同じ「トークン→安全コード写像」方式に合わせる。
 */

export const BRANDING_ERROR_TOKENS = [
  "not_authorized",
  "branding_stale_update",
  "invalid_branding_display_name",
  "invalid_branding_color",
  "invalid_branding_logo_path",
  "organization_branding_delete_forbidden",
  "organization_branding_org_immutable",
] as const;

export type BrandingErrorToken = (typeof BRANDING_ERROR_TOKENS)[number];

export const SAFE_BRANDING_ERROR_CODES = [
  "validation_error",
  "not_authorized",
  "stale_update",
  "logo_invalid",
  "data_access_error",
  "unexpected_error",
] as const;

export type SafeBrandingErrorCode = (typeof SAFE_BRANDING_ERROR_CODES)[number];

/** 例外メッセージから既知トークンを抽出（未知は unexpected_error）。より限定的な語を先に。 */
export function classifyBrandingError(
  message: string | null | undefined,
): BrandingErrorToken | "unexpected_error" {
  if (typeof message !== "string") return "unexpected_error";
  for (const t of BRANDING_ERROR_TOKENS) {
    if (message.includes(t)) return t;
  }
  return "unexpected_error";
}

/** DB トークン → 画面/Action が扱う安全コード。SQLSTATE/SQL/テーブル名/RPC 内部名は出さない。 */
export function toSafeBrandingError(
  message: string | null | undefined,
): SafeBrandingErrorCode {
  const code = classifyBrandingError(message);
  switch (code) {
    case "not_authorized":
    case "organization_branding_delete_forbidden":
    case "organization_branding_org_immutable":
      return "not_authorized";
    case "branding_stale_update":
      return "stale_update";
    case "invalid_branding_logo_path":
      return "logo_invalid";
    case "invalid_branding_display_name":
    case "invalid_branding_color":
      return "validation_error";
    default:
      return "unexpected_error";
  }
}
