"use server";

/**
 * 顧客による招待受諾 Server Action。
 * - RPC app_accept_case_invitation が DB 側で本人メール一致・invited・期限を再検証する
 *   （organization membership は要求しない）。
 * - クライアント送信値は invitationId のみ。email 等は送らせない（DB 側が auth から導出）。
 * - 内部詳細・PII は画面/ログへ出さない。
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/require";
import { isUuid } from "@/lib/auth/validators";
import { classifyCustomerCaseError } from "@/lib/customer-cases/errors";

export async function acceptCaseInvitation(formData: FormData): Promise<void> {
  await requireAuthenticatedUser();

  const invitationId = String(formData.get("invitationId") ?? "");
  if (!isUuid(invitationId)) redirect("/customer/cases");

  const correlationId = crypto.randomUUID();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("app_accept_case_invitation", {
    p_invitation_id: invitationId,
    p_correlation_id: correlationId,
  });

  if (error) {
    console.error(
      "[customer] invitation accept failed code=",
      classifyCustomerCaseError(error.message),
    );
    redirect(`/customer/invitations/${invitationId}?e=1`);
  }

  redirect("/customer/cases?accepted=1");
}
