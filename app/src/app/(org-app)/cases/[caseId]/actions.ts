"use server";

/**
 * 申込者招待 Server Action。
 * - 認証 + active membership をサーバー側で再確認する。
 * - caseId はフォーム値だが、RPC app_invite_case_applicant が
 *   app_can_staff_access_case で DB 側の認可を再検証する（他案件 ID の詐称は not_authorized）。
 * - 招待メールは normalizeEmail で正規化。内部詳細・PII は画面/ログへ出さない。
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireOrgAccess } from "@/lib/auth/require";
import { isUuid, normalizeEmail, isValidEmail } from "@/lib/auth/validators";
import { classifyCustomerCaseError } from "@/lib/customer-cases/errors";

export async function inviteApplicant(formData: FormData): Promise<void> {
  await requireOrgAccess();

  const caseId = String(formData.get("caseId") ?? "");
  const applicantType = String(formData.get("applicantType") ?? "");
  const email = normalizeEmail(formData.get("invitedEmail"));
  const relationship = String(formData.get("relationship") ?? "").trim();

  if (!isUuid(caseId)) redirect("/cases");
  if (applicantType !== "primary" && applicantType !== "co_applicant") {
    redirect(`/cases/${caseId}?e=type`);
  }
  if (!isValidEmail(email)) {
    redirect(`/cases/${caseId}?e=email`);
  }

  const correlationId = crypto.randomUUID();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("app_invite_case_applicant", {
    p_case_id: caseId,
    p_applicant_type: applicantType,
    p_invited_email: email,
    p_relationship_to_primary:
      applicantType === "co_applicant" && relationship.length > 0
        ? relationship
        : null,
    p_expires_at: null,
    p_correlation_id: correlationId,
  });

  if (error) {
    console.error(
      "[cases] invite failed code=",
      classifyCustomerCaseError(error.message),
    );
    redirect(`/cases/${caseId}?e=invite`);
  }

  redirect(`/cases/${caseId}?invited=1`);
}
