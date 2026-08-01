"use server";

/**
 * 案件作成 + 主申込者招待 Server Action。
 * - organizationId / 担当 membershipId はサーバー側で認証コンテキストから導出/検証する
 *   （クライアント申告を信用しない: CLAUDE.md §9）。
 * - SALES_USER は自分を担当に固定。ORGANIZATION_ADMIN は自法人の active メンバーを選択可
 *   （最終検証は RPC app_create_customer_case が DB 側で行う）。
 * - 案件作成 → 主申込者を顧客メールで招待（app_invite_case_applicant）。
 * - 顧客 email 全文・任意メモ・PII を audit metadata・ログ・URL へ入れない。
 */

import { redirect } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/require";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid, normalizeEmail, isValidEmail } from "@/lib/auth/validators";
import { toSafeCaseError } from "@/lib/customer-cases/errors";

export async function createCase(formData: FormData): Promise<void> {
  const { organizationId, membershipId: selfMembershipId, role } =
    await requireOrgAccess();

  const caseName = String(formData.get("caseName") ?? "").trim();
  const priceRaw = String(formData.get("desiredPriceYen") ?? "").trim();
  const customerEmail = normalizeEmail(formData.get("customerEmail"));
  const assignedInput = String(formData.get("assignedMembershipId") ?? "");

  // SALES_USER は自分に固定。ADMIN のみ選択を尊重（それ以外は自分）。
  let assignedMembershipId = selfMembershipId;
  if (role === "ORGANIZATION_ADMIN" && isUuid(assignedInput)) {
    assignedMembershipId = assignedInput;
  }

  if (caseName.length < 1 || caseName.length > 200) {
    redirect("/cases/new?e=name");
  }
  if (!isValidEmail(customerEmail)) {
    redirect("/cases/new?e=email");
  }

  let desiredPriceYen: number | null = null;
  if (priceRaw.length > 0) {
    const n = Number(priceRaw.replace(/[,\s]/g, ""));
    if (!Number.isInteger(n) || n < 0 || n > 100_000_000_000) {
      redirect("/cases/new?e=price");
    }
    desiredPriceYen = n;
  }

  const supabase = await createSupabaseServerClient();

  const created = await supabase.rpc("app_create_customer_case", {
    p_organization_id: organizationId,
    p_assigned_membership_id: assignedMembershipId,
    p_case_name: caseName,
    p_desired_price_yen: desiredPriceYen,
    p_correlation_id: crypto.randomUUID(),
  });
  if (created.error) {
    console.error("[cases] create failed code=", toSafeCaseError(created.error.message));
    redirect("/cases/new?e=create");
  }
  const caseId = String(created.data);

  const invited = await supabase.rpc("app_invite_case_applicant", {
    p_case_id: caseId,
    p_applicant_type: "primary",
    p_invited_email: customerEmail,
    p_relationship_to_primary: null,
    p_expires_at: null,
    p_correlation_id: crypto.randomUUID(),
  });
  if (invited.error) {
    // 案件は作成済み。招待だけ失敗した場合は詳細画面で再招待できる。
    console.error("[cases] invite failed code=", toSafeCaseError(invited.error.message));
    redirect(`/cases/${caseId}?e=invite`);
  }

  redirect(`/cases/${caseId}?invited=1`);
}
