"use server";

/**
 * 招待受諾 Server Action。
 * - RPC app_accept_invitation（DB 側で本人・invited・メール一致・遷移を再検証）
 * - 失敗時はサーバーが例外を捕捉し、service_role の別トランザクションで
 *   失敗監査を記録する（CLAUDE.md §19）
 * - クライアント送信値は membership ID のみ。organizationId は送らせない。
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/auth/validators";
import {
  recordMembershipAcceptFailure,
  toSafeErrorCode,
} from "@/lib/auth/audit";

export async function acceptInvitation(formData: FormData): Promise<void> {
  const membershipId = String(formData.get("membershipId") ?? "");
  if (!isUuid(membershipId)) {
    redirect("/pending-invitation?e=1");
  }

  const correlationId = crypto.randomUUID();
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.rpc("app_accept_invitation", {
    p_membership_id: membershipId,
    p_correlation_id: correlationId,
  });

  if (error) {
    // 失敗監査は別トランザクション（DB 例外で本体はロールバック済み）。
    // action / resource_type / success / organization_id は DB 側で固定・解決される。
    await recordMembershipAcceptFailure({
      actorUserId: user.id,
      membershipId,
      errorCode: toSafeErrorCode(error),
      correlationId,
    });
    redirect("/pending-invitation?e=1");
  }

  redirect("/");
}
