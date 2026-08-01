/**
 * Phase 2A-2b: 提携ローン入力の純粋バリデーション + RPC 用 payload 構築。
 * 依存ゼロ（unit test 対象）。金額=円整数、料率=bps 整数（CLAUDE.md §11）。
 * 内部審査メモ等の PII/機微文言はここでは値を出さない（違反はフィールド名のみ返す）。
 */

import {
  isInterestRateType,
  isHandlingFeeType,
  PROPERTY_TYPES,
  EMPLOYMENT_TYPES,
  type PropertyType,
  type EmploymentType,
} from "./types";

export interface PartnerLoanFormValues {
  institutionName: string;
  displayName: string;
  productName: string;
  productType: string;
  description: string;
  interestRateType: string;
  baseRatePercent: string;
  preferentialRatePercent: string;
  indicativeRatePercent: string;
  minLoanAmountYen: string;
  maxLoanAmountYen: string;
  minTermYears: string;
  maxTermYears: string;
  maxLtvPercent: string;
  handlingFeeType: string;
  handlingFeeYen: string;
  handlingFeePercent: string;
  guaranteeFeeDescription: string;
  otherFeesDescription: string;
  propertyTypes: string[];
  eligibleAreas: string;
  minAnnualIncomeYen: string;
  minEmploymentMonths: string;
  employmentTypes: string[];
  minAge: string;
  maxApplicationAge: string;
  maxAgeAtMaturity: string;
  groupCreditLifeInsuranceSummary: string;
  customerDisclosure: string;
  internalUnderwritingNotes: string;
  applicationUrl: string;
  externalProductKey: string;
  inquiryContact: string;
  validFrom: string;
  validUntil: string;
  confirmedAt: string;
}

export type PartnerLoanFieldError =
  | "institution_name"
  | "display_name"
  | "product_name"
  | "interest_rate_type"
  | "base_rate"
  | "preferential_rate"
  | "indicative_rate"
  | "min_amount"
  | "max_amount"
  | "amount_range"
  | "min_term"
  | "max_term"
  | "term_range"
  | "max_ltv"
  | "handling_fee"
  | "min_income"
  | "min_employment_months"
  | "min_age"
  | "max_application_age"
  | "max_age_at_maturity"
  | "application_url"
  | "valid_period";

export interface PartnerLoanValidationResult {
  errors: PartnerLoanFieldError[];
  institutionName: string;
  displayName: string;
  version: Record<string, unknown> | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS_RE = /^https:\/\/[^\s]+$/;

function nz(s: string): string | null {
  const t = s.trim();
  return t.length > 0 ? t : null;
}

/** % 文字列 → bps 整数（1.25% → 125）。範囲外/非数は null + エラー。 */
function pctToBps(
  raw: string,
  field: PartnerLoanFieldError,
  errors: PartnerLoanFieldError[],
  maxPercent = 100,
): number | null {
  const t = raw.trim();
  if (t.length === 0) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > maxPercent) {
    errors.push(field);
    return null;
  }
  return Math.round(n * 100);
}

function yen(
  raw: string,
  field: PartnerLoanFieldError,
  errors: PartnerLoanFieldError[],
): number | null {
  const t = raw.replace(/[,\s]/g, "");
  if (t.length === 0) return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 100_000_000_000) {
    errors.push(field);
    return null;
  }
  return n;
}

function intField(
  raw: string,
  field: PartnerLoanFieldError,
  errors: PartnerLoanFieldError[],
  min: number,
  max: number,
): number | null {
  const t = raw.trim();
  if (t.length === 0) return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < min || n > max) {
    errors.push(field);
    return null;
  }
  return n;
}

/**
 * フォーム値を検証し、正しければ RPC 用 payload を返す。
 * 空欄は原則許容（product_name / interest_rate_type / display_name / institution は必須）。
 */
export function validatePartnerLoanForm(
  values: PartnerLoanFormValues,
): PartnerLoanValidationResult {
  const errors: PartnerLoanFieldError[] = [];

  const institutionName = values.institutionName.trim();
  const displayName = values.displayName.trim();
  const productName = values.productName.trim();

  if (institutionName.length < 1 || institutionName.length > 200) {
    errors.push("institution_name");
  }
  if (displayName.length < 1 || displayName.length > 200) {
    errors.push("display_name");
  }
  if (productName.length < 1 || productName.length > 200) {
    errors.push("product_name");
  }
  if (!isInterestRateType(values.interestRateType)) {
    errors.push("interest_rate_type");
  }

  const baseRateBps = pctToBps(values.baseRatePercent, "base_rate", errors);
  const prefRateBps = pctToBps(
    values.preferentialRatePercent,
    "preferential_rate",
    errors,
  );
  const indicativeRateBps = pctToBps(
    values.indicativeRatePercent,
    "indicative_rate",
    errors,
  );

  const minAmount = yen(values.minLoanAmountYen, "min_amount", errors);
  const maxAmount = yen(values.maxLoanAmountYen, "max_amount", errors);
  if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
    errors.push("amount_range");
  }

  const minTerm = intField(values.minTermYears, "min_term", errors, 0, 100);
  const maxTerm = intField(values.maxTermYears, "max_term", errors, 0, 100);
  if (minTerm !== null && maxTerm !== null && minTerm > maxTerm) {
    errors.push("term_range");
  }

  const maxLtvBps = pctToBps(values.maxLtvPercent, "max_ltv", errors, 200);

  let handlingFeeType: string | null = null;
  let handlingFeeYen: number | null = null;
  let handlingFeeBps: number | null = null;
  if (isHandlingFeeType(values.handlingFeeType)) {
    handlingFeeType = values.handlingFeeType;
    if (values.handlingFeeType === "fixed_yen") {
      handlingFeeYen = yen(values.handlingFeeYen, "handling_fee", errors);
    } else {
      handlingFeeBps = pctToBps(values.handlingFeePercent, "handling_fee", errors);
    }
  } else if (values.handlingFeeType.trim().length > 0) {
    errors.push("handling_fee");
  }

  const minIncome = yen(values.minAnnualIncomeYen, "min_income", errors);
  const minEmpMonths = intField(
    values.minEmploymentMonths,
    "min_employment_months",
    errors,
    0,
    1200,
  );
  const minAge = intField(values.minAge, "min_age", errors, 0, 120);
  const maxAppAge = intField(
    values.maxApplicationAge,
    "max_application_age",
    errors,
    0,
    120,
  );
  const maxMaturityAge = intField(
    values.maxAgeAtMaturity,
    "max_age_at_maturity",
    errors,
    0,
    120,
  );

  const applicationUrl = nz(values.applicationUrl);
  if (applicationUrl !== null && !HTTPS_RE.test(applicationUrl)) {
    errors.push("application_url");
  }

  const validFrom = nz(values.validFrom);
  const validUntil = nz(values.validUntil);
  for (const [d, f] of [
    [validFrom, "valid_period"],
    [validUntil, "valid_period"],
  ] as const) {
    if (d !== null && !DATE_RE.test(d)) errors.push(f);
  }
  if (
    validFrom !== null &&
    validUntil !== null &&
    DATE_RE.test(validFrom) &&
    DATE_RE.test(validUntil) &&
    validFrom > validUntil
  ) {
    errors.push("valid_period");
  }

  const propertyTypes = values.propertyTypes.filter((t): t is PropertyType =>
    (PROPERTY_TYPES as readonly string[]).includes(t),
  );
  const employmentTypes = values.employmentTypes.filter(
    (t): t is EmploymentType =>
      (EMPLOYMENT_TYPES as readonly string[]).includes(t),
  );
  const eligibleAreas = values.eligibleAreas
    .split(/[,\n、]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 50);

  if (errors.length > 0) {
    return { errors: dedupe(errors), institutionName, displayName, version: null };
  }

  const version: Record<string, unknown> = {
    product_name: productName,
    interest_rate_type: values.interestRateType,
  };
  const put = (k: string, v: unknown) => {
    if (v !== null && v !== undefined) version[k] = v;
  };
  put("product_type", nz(values.productType));
  put("description", nz(values.description));
  put("base_rate_bps", baseRateBps);
  put("preferential_rate_reduction_bps", prefRateBps);
  put("indicative_rate_bps", indicativeRateBps);
  put("minimum_loan_amount_yen", minAmount);
  put("maximum_loan_amount_yen", maxAmount);
  put("minimum_term_years", minTerm);
  put("maximum_term_years", maxTerm);
  put("maximum_ltv_bps", maxLtvBps);
  put("handling_fee_type", handlingFeeType);
  put("handling_fee_yen", handlingFeeYen);
  put("handling_fee_bps", handlingFeeBps);
  put("guarantee_fee_description", nz(values.guaranteeFeeDescription));
  put("other_fees_description", nz(values.otherFeesDescription));
  if (propertyTypes.length > 0) version.eligible_property_types = propertyTypes;
  if (eligibleAreas.length > 0) version.eligible_areas = eligibleAreas;
  put("minimum_annual_income_yen", minIncome);
  put("minimum_employment_months", minEmpMonths);
  if (employmentTypes.length > 0) version.eligible_employment_types = employmentTypes;
  put("minimum_age", minAge);
  put("maximum_application_age", maxAppAge);
  put("maximum_age_at_maturity", maxMaturityAge);
  put("group_credit_life_insurance_summary", nz(values.groupCreditLifeInsuranceSummary));
  put("customer_disclosure", nz(values.customerDisclosure));
  put("internal_underwriting_notes", nz(values.internalUnderwritingNotes));
  put("application_url", applicationUrl);
  put("external_product_key", nz(values.externalProductKey));
  put("inquiry_contact", nz(values.inquiryContact));
  put("valid_from", validFrom);
  put("valid_until", validUntil);
  put("confirmed_at", nz(values.confirmedAt));

  return { errors: [], institutionName, displayName, version };
}

function dedupe(errors: PartnerLoanFieldError[]): PartnerLoanFieldError[] {
  return [...new Set(errors)];
}
