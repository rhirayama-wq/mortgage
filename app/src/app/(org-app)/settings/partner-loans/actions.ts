"use server";

/**
 * 提携ローン管理 Server Action 群。
 * - ORGANIZATION_ADMIN のみ書込可（サーバー側で role 再確認 + RPC 側でも再認可）。
 * - organizationId はクライアント任せにせず認証コンテキストから導出。
 * - 業務テーブルへ直接書込しない。RPC 経由のみ。内部詳細・条件全文は画面/ログへ出さない。
 */

import { redirect } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/require";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/auth/validators";
import { partnerLoanFormValues } from "@/lib/partner-loans/form";
import { validatePartnerLoanForm } from "@/lib/partner-loans/validation";
import { toSafePartnerLoanError } from "@/lib/partner-loans/errors";

async function requireAdmin(): Promise<{ organizationId: string }> {
  const { organizationId, role } = await requireOrgAccess();
  if (role !== "ORGANIZATION_ADMIN") {
    redirect("/settings/partner-loans?e=forbidden");
  }
  return { organizationId };
}

export async function createPartnerLoan(formData: FormData): Promise<void> {
  const { organizationId } = await requireAdmin();
  const { errors, institutionName, displayName, version } =
    validatePartnerLoanForm(partnerLoanFormValues(formData));
  if (errors.length > 0 || !version) {
    redirect("/settings/partner-loans/new?e=validation");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "app_create_organization_partner_loan",
    {
      p_organization_id: organizationId,
      p_institution_name: institutionName,
      p_display_name: displayName,
      p_version: version,
      p_correlation_id: crypto.randomUUID(),
    },
  );
  if (error) {
    console.error(
      "[partner-loans] create failed code=",
      toSafePartnerLoanError(error.message),
    );
    redirect("/settings/partner-loans/new?e=save");
  }
  redirect(`/settings/partner-loans/${String(data)}?created=1`);
}

export async function updatePartnerLoan(formData: FormData): Promise<void> {
  await requireAdmin();
  const partnerLoanId = String(formData.get("partnerLoanId") ?? "");
  const expectedVersionId = String(formData.get("expectedVersionId") ?? "");
  if (!isUuid(partnerLoanId)) redirect("/settings/partner-loans");

  const { errors, displayName, version } = validatePartnerLoanForm(
    partnerLoanFormValues(formData),
  );
  if (errors.length > 0 || !version) {
    redirect(`/settings/partner-loans/${partnerLoanId}/edit?e=validation`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("app_update_organization_partner_loan", {
    p_partner_loan_id: partnerLoanId,
    p_expected_current_version_id: isUuid(expectedVersionId)
      ? expectedVersionId
      : null,
    p_display_name: displayName,
    p_version: version,
    p_correlation_id: crypto.randomUUID(),
  });
  if (error) {
    const code = toSafePartnerLoanError(error.message);
    console.error("[partner-loans] update failed code=", code);
    if (code === "partner_loan_version_conflict") {
      redirect(`/settings/partner-loans/${partnerLoanId}?e=conflict`);
    }
    redirect(`/settings/partner-loans/${partnerLoanId}/edit?e=save`);
  }
  redirect(`/settings/partner-loans/${partnerLoanId}?updated=1`);
}

async function transition(
  formData: FormData,
  rpc:
    | "app_activate_organization_partner_loan"
    | "app_deactivate_organization_partner_loan"
    | "app_confirm_organization_partner_loan",
  okFlag: string,
): Promise<void> {
  await requireAdmin();
  const partnerLoanId = String(formData.get("partnerLoanId") ?? "");
  if (!isUuid(partnerLoanId)) redirect("/settings/partner-loans");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(rpc, {
    p_partner_loan_id: partnerLoanId,
    p_correlation_id: crypto.randomUUID(),
  });
  if (error) {
    console.error(
      `[partner-loans] ${rpc} failed code=`,
      toSafePartnerLoanError(error.message),
    );
    redirect(`/settings/partner-loans/${partnerLoanId}?e=action`);
  }
  redirect(`/settings/partner-loans/${partnerLoanId}?${okFlag}=1`);
}

export async function activatePartnerLoan(formData: FormData): Promise<void> {
  await transition(formData, "app_activate_organization_partner_loan", "activated");
}
export async function deactivatePartnerLoan(formData: FormData): Promise<void> {
  await transition(formData, "app_deactivate_organization_partner_loan", "deactivated");
}
export async function confirmPartnerLoan(formData: FormData): Promise<void> {
  await transition(formData, "app_confirm_organization_partner_loan", "confirmed");
}
