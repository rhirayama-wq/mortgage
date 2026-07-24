/**
 * 失敗監査のサーバー側記録（CLAUDE.md §19）。
 * DB 業務関数の失敗は例外でロールバックされるため、サーバーが例外を捕捉し、
 * service_role で別トランザクションとして app_record_failure_audit を呼ぶ。
 *
 * - この関数自体は決して throw しない（監査失敗で業務エラー処理を壊さない）
 * - PII 本文・財務情報・JWT・秘密情報を metadata に入れない
 */

import { createSupabaseServiceClient } from "../supabase/service";

export interface FailureAuditInput {
  action: string;
  actorUserId: string | null;
  organizationId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  errorCode: string;
  correlationId: string;
}

export async function recordFailureAudit(input: FailureAuditInput): Promise<void> {
  try {
    const service = createSupabaseServiceClient();
    const { error } = await service.rpc("app_record_failure_audit", {
      p_action: input.action,
      p_actor_user_id: input.actorUserId,
      p_organization_id: input.organizationId,
      p_resource_type: input.resourceType,
      p_resource_id: input.resourceId,
      p_error_code: input.errorCode,
      p_correlation_id: input.correlationId,
      p_metadata: {},
    });
    if (error) {
      // 監査記録自体の失敗は correlation ID のみでログする（PIIなし）
      console.error(
        `[audit] failure-audit write failed correlation=${input.correlationId}`,
      );
    }
  } catch {
    console.error(
      `[audit] failure-audit unexpected error correlation=${input.correlationId}`,
    );
  }
}

/** Supabase/Postgres エラーから安全な error_code を抽出（内部詳細は載せない） */
export function toSafeErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      // 業務関数の RAISE は機械可読な短いコード（例: not_authorized）
      const known = [
        "not_authorized",
        "invite_email_mismatch",
        "membership_not_found",
        "membership_invalid_transition",
        "membership_already_exists",
        "membership_left_terminal",
        "membership_role_change_requires_active",
        "last_organization_admin_protected",
        "last_system_admin_protected",
        "organization_not_found_or_archived",
        "invited_user_not_found",
        "invalid_email",
        "user_not_found",
      ];
      for (const code of known) {
        if (message.includes(code)) return code;
      }
    }
  }
  return "unexpected_error";
}
