/**
 * Phase 2A-2b: 提携ローンのサーバー側読み取り（Server Component 専用）。
 * - ORG_ADMIN: RLS 経由でテーブルを直接読む（全 status・内部メモを含む詳細）。
 * - SALES_USER: 定義者関数 app_list_org_active_partner_loans（有効商品・安全な列のみ）。
 * - 他 organization は RLS で不可視（0 件）。DB エラーは DataAccessError（fail closed）。
 */

import { createSupabaseServerClient } from "../supabase/server";
import { DataAccessError, DataIntegrityError } from "../auth/errors";
import { isPartnerLoanStatus, type PartnerLoanStatus } from "./types";

type Supa = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function asPartnerStatus(v: unknown): PartnerLoanStatus {
  if (!isPartnerLoanStatus(v)) {
    throw new DataIntegrityError("unexpected partner_loan status");
  }
  return v;
}

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export interface PartnerLoanVersionSummary {
  versionNumber: number;
  productName: string;
  indicativeRateBps: number | null;
  maximumLoanAmountYen: number | null;
  validFrom: string | null;
  validUntil: string | null;
}

export interface PartnerLoanListItem {
  id: string;
  displayName: string;
  institutionName: string;
  status: PartnerLoanStatus;
  lastConfirmedAt: string | null;
  updatedAt: string;
  currentVersion: PartnerLoanVersionSummary | null;
}

export interface PartnerLoanSummary {
  total: number;
  active: number;
  draft: number;
  needsConfirmation: number;
  expiringSoon: number;
}

const CONFIRM_STALE_DAYS = 90;
const EXPIRE_SOON_DAYS = 30;

async function institutionNames(
  supabase: Supa,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(ids)].filter((v) => v.length > 0);
  if (uniq.length === 0) return map;
  const res = await supabase
    .from("lending_institutions")
    .select("id, display_name")
    .in("id", uniq);
  if (res.error) throw new DataAccessError("failed to load institutions");
  for (const r of res.data ?? []) {
    map.set(String(r.id), String(r.display_name));
  }
  return map;
}

async function versionSummaries(
  supabase: Supa,
  ids: string[],
): Promise<Map<string, PartnerLoanVersionSummary>> {
  const map = new Map<string, PartnerLoanVersionSummary>();
  const uniq = [...new Set(ids)].filter((v) => v.length > 0);
  if (uniq.length === 0) return map;
  const res = await supabase
    .from("organization_partner_loan_versions")
    .select(
      "id, version_number, product_name, indicative_rate_bps, maximum_loan_amount_yen, valid_from, valid_until",
    )
    .in("id", uniq);
  if (res.error) throw new DataAccessError("failed to load versions");
  for (const r of res.data ?? []) {
    map.set(String(r.id), {
      versionNumber: Number(r.version_number),
      productName: String(r.product_name),
      indicativeRateBps: num(r.indicative_rate_bps),
      maximumLoanAmountYen: num(r.maximum_loan_amount_yen),
      validFrom: str(r.valid_from),
      validUntil: str(r.valid_until),
    });
  }
  return map;
}

/** ORG_ADMIN 向け: 自 org の提携ローン全件（全 status）。 */
export async function loadPartnerLoanAdminList(
  organizationId: string,
): Promise<PartnerLoanListItem[]> {
  const supabase = await createSupabaseServerClient();
  const res = await supabase
    .from("organization_partner_loans")
    .select(
      "id, display_name, status, current_version_id, last_confirmed_at, updated_at, lending_institution_id",
    )
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });
  if (res.error) throw new DataAccessError("failed to load partner loans");
  const rows = res.data ?? [];

  const instNames = await institutionNames(
    supabase,
    rows.map((r) => String(r.lending_institution_id)),
  );
  const verSummaries = await versionSummaries(
    supabase,
    rows.filter((r) => r.current_version_id).map((r) => String(r.current_version_id)),
  );

  return rows.map((r) => ({
    id: String(r.id),
    displayName: String(r.display_name),
    institutionName: instNames.get(String(r.lending_institution_id)) ?? "—",
    status: asPartnerStatus(r.status),
    lastConfirmedAt: str(r.last_confirmed_at),
    updatedAt: String(r.updated_at),
    currentVersion: r.current_version_id
      ? verSummaries.get(String(r.current_version_id)) ?? null
      : null,
  }));
}

/** 一覧からサマリー（登録/有効/下書き/要確認/期限間近）を導出。 */
export function summarizePartnerLoans(
  items: PartnerLoanListItem[],
  nowMs: number,
): PartnerLoanSummary {
  const staleMs = CONFIRM_STALE_DAYS * 24 * 60 * 60 * 1000;
  const soonMs = EXPIRE_SOON_DAYS * 24 * 60 * 60 * 1000;
  let active = 0;
  let draft = 0;
  let needsConfirmation = 0;
  let expiringSoon = 0;
  for (const it of items) {
    if (it.status === "active") active += 1;
    if (it.status === "draft") draft += 1;
    if (it.status !== "inactive") {
      const confirmed = it.lastConfirmedAt ? Date.parse(it.lastConfirmedAt) : NaN;
      if (Number.isNaN(confirmed) || nowMs - confirmed > staleMs) {
        needsConfirmation += 1;
      }
      const until = it.currentVersion?.validUntil
        ? Date.parse(`${it.currentVersion.validUntil}T00:00:00Z`)
        : NaN;
      if (!Number.isNaN(until) && until - nowMs <= soonMs && until >= nowMs) {
        expiringSoon += 1;
      }
    }
  }
  return { total: items.length, active, draft, needsConfirmation, expiringSoon };
}

export interface SalesActivePartnerLoan {
  partnerLoanId: string;
  displayName: string;
  institutionName: string;
  productName: string;
  interestRateType: string;
  indicativeRateBps: number | null;
  maximumLoanAmountYen: number | null;
  validFrom: string | null;
  validUntil: string | null;
  customerDisclosure: string | null;
}

/** SALES_USER 向け: 自 org の有効商品（安全な列のみ・内部メモ非含有）。 */
export async function loadSalesActivePartnerLoans(
  organizationId: string,
): Promise<SalesActivePartnerLoan[]> {
  const supabase = await createSupabaseServerClient();
  const res = await supabase.rpc("app_list_org_active_partner_loans", {
    p_organization_id: organizationId,
  });
  if (res.error) throw new DataAccessError("failed to load active partner loans");
  return ((res.data as unknown[] | null) ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      partnerLoanId: String(r.partner_loan_id),
      displayName: String(r.display_name),
      institutionName: String(r.institution_name),
      productName: String(r.product_name),
      interestRateType: String(r.interest_rate_type),
      indicativeRateBps: num(r.indicative_rate_bps),
      maximumLoanAmountYen: num(r.maximum_loan_amount_yen),
      validFrom: str(r.valid_from),
      validUntil: str(r.valid_until),
      customerDisclosure: str(r.customer_disclosure),
    };
  });
}

export interface PartnerLoanVersionDetail {
  id: string;
  versionNumber: number;
  productName: string;
  productType: string | null;
  description: string | null;
  interestRateType: string;
  baseRateBps: number | null;
  preferentialRateReductionBps: number | null;
  indicativeRateBps: number | null;
  minimumLoanAmountYen: number | null;
  maximumLoanAmountYen: number | null;
  minimumTermYears: number | null;
  maximumTermYears: number | null;
  maximumLtvBps: number | null;
  handlingFeeType: string | null;
  handlingFeeYen: number | null;
  handlingFeeBps: number | null;
  guaranteeFeeDescription: string | null;
  otherFeesDescription: string | null;
  eligiblePropertyTypes: string[];
  eligibleAreas: string[];
  minimumAnnualIncomeYen: number | null;
  minimumEmploymentMonths: number | null;
  eligibleEmploymentTypes: string[];
  minimumAge: number | null;
  maximumApplicationAge: number | null;
  maximumAgeAtMaturity: number | null;
  groupCreditLifeInsuranceSummary: string | null;
  customerDisclosure: string | null;
  internalUnderwritingNotes: string | null;
  applicationUrl: string | null;
  externalProductKey: string | null;
  inquiryContact: string | null;
  validFrom: string | null;
  validUntil: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface PartnerLoanDetail {
  id: string;
  displayName: string;
  institutionName: string;
  status: PartnerLoanStatus;
  currentVersionId: string | null;
  lastConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  versions: PartnerLoanVersionDetail[];
}

const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function toVersionDetail(r: Record<string, unknown>): PartnerLoanVersionDetail {
  return {
    id: String(r.id),
    versionNumber: Number(r.version_number),
    productName: String(r.product_name),
    productType: str(r.product_type),
    description: str(r.description),
    interestRateType: String(r.interest_rate_type),
    baseRateBps: num(r.base_rate_bps),
    preferentialRateReductionBps: num(r.preferential_rate_reduction_bps),
    indicativeRateBps: num(r.indicative_rate_bps),
    minimumLoanAmountYen: num(r.minimum_loan_amount_yen),
    maximumLoanAmountYen: num(r.maximum_loan_amount_yen),
    minimumTermYears: num(r.minimum_term_years),
    maximumTermYears: num(r.maximum_term_years),
    maximumLtvBps: num(r.maximum_ltv_bps),
    handlingFeeType: str(r.handling_fee_type),
    handlingFeeYen: num(r.handling_fee_yen),
    handlingFeeBps: num(r.handling_fee_bps),
    guaranteeFeeDescription: str(r.guarantee_fee_description),
    otherFeesDescription: str(r.other_fees_description),
    eligiblePropertyTypes: arr(r.eligible_property_types),
    eligibleAreas: arr(r.eligible_areas),
    minimumAnnualIncomeYen: num(r.minimum_annual_income_yen),
    minimumEmploymentMonths: num(r.minimum_employment_months),
    eligibleEmploymentTypes: arr(r.eligible_employment_types),
    minimumAge: num(r.minimum_age),
    maximumApplicationAge: num(r.maximum_application_age),
    maximumAgeAtMaturity: num(r.maximum_age_at_maturity),
    groupCreditLifeInsuranceSummary: str(r.group_credit_life_insurance_summary),
    customerDisclosure: str(r.customer_disclosure),
    internalUnderwritingNotes: str(r.internal_underwriting_notes),
    applicationUrl: str(r.application_url),
    externalProductKey: str(r.external_product_key),
    inquiryContact: str(r.inquiry_contact),
    validFrom: str(r.valid_from),
    validUntil: str(r.valid_until),
    confirmedAt: str(r.confirmed_at),
    createdAt: String(r.created_at),
  };
}

/** ORG_ADMIN 向け詳細（current + 過去 version）。未取得(未認可/不存在)は null。 */
export async function loadPartnerLoanDetail(
  partnerLoanId: string,
): Promise<PartnerLoanDetail | null> {
  const supabase = await createSupabaseServerClient();
  const loanRes = await supabase
    .from("organization_partner_loans")
    .select(
      "id, display_name, status, current_version_id, last_confirmed_at, created_at, updated_at, lending_institution_id",
    )
    .eq("id", partnerLoanId)
    .maybeSingle();
  if (loanRes.error) throw new DataAccessError("failed to load partner loan");
  if (!loanRes.data) return null;
  const l = loanRes.data;

  const instNames = await institutionNames(supabase, [
    String(l.lending_institution_id),
  ]);

  const versRes = await supabase
    .from("organization_partner_loan_versions")
    .select("*")
    .eq("partner_loan_id", partnerLoanId)
    .order("version_number", { ascending: false });
  if (versRes.error) throw new DataAccessError("failed to load versions");

  return {
    id: String(l.id),
    displayName: String(l.display_name),
    institutionName: instNames.get(String(l.lending_institution_id)) ?? "—",
    status: asPartnerStatus(l.status),
    currentVersionId: str(l.current_version_id),
    lastConfirmedAt: str(l.last_confirmed_at),
    createdAt: String(l.created_at),
    updatedAt: String(l.updated_at),
    versions: (versRes.data ?? []).map((r) =>
      toVersionDetail(r as Record<string, unknown>),
    ),
  };
}
