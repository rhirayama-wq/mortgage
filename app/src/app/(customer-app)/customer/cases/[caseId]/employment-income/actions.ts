"use server";

/**
 * 顧客の勤務・収入情報の途中保存 Server Action（オートセーブ）。
 * - RPC app_upsert_own_applicant_employment_income が DB 側で participant 本人・案件状態を再検証する。
 * - applicantId はクライアント由来だが、RPC の app_participant_owns_applicant が本人性を担保する
 *   （他人の applicantId を送っても not_authorized）。
 * - 完了(complete)判定は DB 純粋関数が唯一の正。TS は形式検証のみ（雇用形態別必須は重複させない）。
 * - 財務値（勤務先名・年収・入社年月・収入区分）はログ・URL・監査 metadata へ出さない。
 */

import { requireAuthenticatedUser } from "@/lib/auth/require";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/auth/validators";
import { classifyCustomerCaseError } from "@/lib/customer-cases/errors";
import {
  validateEmploymentIncome,
  toEmploymentIncomeRpcArgs,
  type EmploymentIncomeInput,
  type EmploymentIncomeFieldError,
} from "@/lib/customer-cases/employment-income";

export interface SaveEmploymentIncomeResult {
  ok: boolean;
  savedAt: string | null;
  /** DB 純粋関数由来の完了判定（TS では判定しない）。 */
  isComplete: boolean;
  /** DB 由来の不足フィールドコード（値は含まない）。 */
  missingFields: string[];
  error?: "validation" | "not_authorized" | "not_inputtable" | "failed";
  fieldErrors?: EmploymentIncomeFieldError[];
}

export async function saveEmploymentIncome(
  applicantId: string,
  input: EmploymentIncomeInput,
): Promise<SaveEmploymentIncomeResult> {
  await requireAuthenticatedUser();

  if (!isUuid(applicantId)) {
    return {
      ok: false,
      savedAt: null,
      isComplete: false,
      missingFields: [],
      error: "failed",
    };
  }

  const fieldErrors = validateEmploymentIncome(input);
  if (fieldErrors.length > 0) {
    return {
      ok: false,
      savedAt: null,
      isComplete: false,
      missingFields: [],
      error: "validation",
      fieldErrors,
    };
  }

  const rpcArgs = toEmploymentIncomeRpcArgs(input);
  const correlationId = crypto.randomUUID();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "app_upsert_own_applicant_employment_income",
    {
      p_applicant_id: applicantId,
      p_employer_name: rpcArgs.employerName,
      p_employment_type: rpcArgs.employmentType,
      p_employment_started_on: rpcArgs.employmentStartedOn,
      p_annual_gross_income_yen: rpcArgs.annualGrossIncomeYen,
      p_income_type: rpcArgs.incomeType,
      p_correlation_id: correlationId,
    },
  );

  if (error) {
    const code = classifyCustomerCaseError(error.message);
    // 財務値は出さない（分類コードのみ）。
    console.error("[customer] employment-income save failed code=", code);
    let mapped: SaveEmploymentIncomeResult["error"] = "failed";
    if (code === "not_authorized") mapped = "not_authorized";
    else if (
      code === "customer_case_not_inputtable" ||
      code === "applicant_not_active"
    ) {
      mapped = "not_inputtable";
    } else if (
      code === "invalid_employment_income_field" ||
      code === "invalid_employment_started_on" ||
      code === "invalid_annual_income"
    ) {
      mapped = "validation";
    }
    return {
      ok: false,
      savedAt: null,
      isComplete: false,
      missingFields: [],
      error: mapped,
    };
  }

  // RPC は TABLE(updated_at, is_complete, missing_fields) を返す（1 行）。
  const row = (Array.isArray(data) ? data[0] : data) as
    | Record<string, unknown>
    | undefined;
  const savedAt =
    typeof row?.updated_at === "string" ? row.updated_at : null;
  const isComplete = Boolean(row?.is_complete);
  const missingFields = Array.isArray(row?.missing_fields)
    ? (row?.missing_fields as unknown[]).map((v) => String(v))
    : [];

  return { ok: true, savedAt, isComplete, missingFields };
}
