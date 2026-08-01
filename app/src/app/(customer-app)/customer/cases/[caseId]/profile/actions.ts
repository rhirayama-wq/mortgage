"use server";

/**
 * 顧客基本情報(PII)の途中保存 Server Action（オートセーブ）。
 * - RPC app_update_own_applicant_profile が DB 側で participant 本人・案件状態を再検証する。
 * - applicantId はクライアント由来だが、RPC の app_participant_owns_applicant が本人性を担保する
 *   （他人の applicantId を送っても not_authorized）。
 * - PII 値はログ・URL・監査 metadata へ出さない（監査は DB 側で変更フィールド名のみ）。
 */

import { requireAuthenticatedUser } from "@/lib/auth/require";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/auth/validators";
import { classifyCustomerCaseError } from "@/lib/customer-cases/errors";
import {
  validateBasicProfile,
  type BasicApplicantProfileInput,
  type BasicProfileFieldError,
} from "@/lib/customer-cases/profile";

export interface SaveBasicProfileResult {
  ok: boolean;
  savedAt: string | null;
  error?: "validation" | "not_authorized" | "not_inputtable" | "failed";
  fieldErrors?: BasicProfileFieldError[];
}

export async function saveBasicProfile(
  applicantId: string,
  input: BasicApplicantProfileInput,
): Promise<SaveBasicProfileResult> {
  await requireAuthenticatedUser();

  if (!isUuid(applicantId)) {
    return { ok: false, savedAt: null, error: "failed" };
  }

  const fieldErrors = validateBasicProfile(input);
  if (fieldErrors.length > 0) {
    return { ok: false, savedAt: null, error: "validation", fieldErrors };
  }

  const norm = (v: string): string | null => {
    const t = v.trim();
    return t.length > 0 ? t : null;
  };

  const correlationId = crypto.randomUUID();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("app_update_own_applicant_profile", {
    p_applicant_id: applicantId,
    p_full_name: norm(input.fullName),
    p_full_name_kana: norm(input.fullNameKana),
    p_birth_date: norm(input.birthDate),
    p_email: norm(input.email),
    p_phone: norm(input.phone),
    p_postal_code: norm(input.postalCode),
    p_address: norm(input.address),
    p_correlation_id: correlationId,
  });

  if (error) {
    const code = classifyCustomerCaseError(error.message);
    // PII は出さない（分類コードのみ）。
    console.error("[customer] profile save failed code=", code);
    let mapped: SaveBasicProfileResult["error"] = "failed";
    if (code === "not_authorized") mapped = "not_authorized";
    else if (
      code === "customer_case_not_inputtable" ||
      code === "applicant_not_active"
    ) {
      mapped = "not_inputtable";
    } else if (code.startsWith("invalid_profile")) {
      mapped = "validation";
    }
    return { ok: false, savedAt: null, error: mapped };
  }

  return { ok: true, savedAt: typeof data === "string" ? data : null };
}
