/**
 * Phase 2A-2b: 提携ローンの enum 相当型（DB enum と一致させる）。
 * 正本は 0004_phase2b_partner_loans.sql。純粋・依存ゼロ。
 */

export const PARTNER_LOAN_STATUSES = ["draft", "active", "inactive"] as const;
export type PartnerLoanStatus = (typeof PARTNER_LOAN_STATUSES)[number];

export const INTEREST_RATE_TYPES = ["variable", "fixed", "fixed_period"] as const;
export type InterestRateType = (typeof INTEREST_RATE_TYPES)[number];

export const HANDLING_FEE_TYPES = ["fixed_yen", "rate_bps"] as const;
export type HandlingFeeType = (typeof HANDLING_FEE_TYPES)[number];

export const PROPERTY_TYPES = ["new", "used", "condo", "house"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const EMPLOYMENT_TYPES = [
  "full_time",
  "contract",
  "self_employed",
  "part_time",
  "executive",
  "other",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export function isPartnerLoanStatus(v: unknown): v is PartnerLoanStatus {
  return (
    typeof v === "string" &&
    (PARTNER_LOAN_STATUSES as readonly string[]).includes(v)
  );
}
export function isInterestRateType(v: unknown): v is InterestRateType {
  return (
    typeof v === "string" &&
    (INTEREST_RATE_TYPES as readonly string[]).includes(v)
  );
}
export function isHandlingFeeType(v: unknown): v is HandlingFeeType {
  return (
    typeof v === "string" &&
    (HANDLING_FEE_TYPES as readonly string[]).includes(v)
  );
}
