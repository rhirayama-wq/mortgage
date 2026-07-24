/**
 * 失敗監査のサーバー側記録（CLAUDE.md §19）。
 * DB 業務関数の失敗は例外でロールバックされるため、サーバーが例外を捕捉し、
 * service_role で **専用の** 失敗監査関数を別トランザクションとして呼ぶ。
 * Phase 1 の失敗監査対象は membership.accept のみ（汎用監査 RPC は置かない）。
 *
 * DB 側 (app_record_membership_accept_failure) の制約:
 * - action='membership.accept' / resource_type='organization_membership' /
 *   success=false / metadata='{}' は固定（呼出し側から変更不能）
 * - error_code は許可リスト検証
 * - organization_id は membership から DB 側で解決（クライアント申告不可）
 * - EXECUTE は service_role のみ
 *
 * この関数自体は決して throw しない（監査失敗で業務エラー処理を壊さない）。
 * PII・JWT・秘密情報をログへ出さない。
 */

import { createSupabaseServiceClient } from "../supabase/service";

/** DB 側許可リストと同一に保つこと（migration 0001 の c_allowed_error_codes） */
export const MEMBERSHIP_ACCEPT_ERROR_CODES = [
  "not_authorized",
  "invite_email_mismatch",
  "membership_not_found",
  "membership_invalid_transition",
  "membership_left_terminal",
  "organization_not_found_or_archived",
  "unexpected_error",
] as const;

export type MembershipAcceptErrorCode =
  (typeof MEMBERSHIP_ACCEPT_ERROR_CODES)[number];

export interface MembershipAcceptFailureInput {
  actorUserId: string;
  membershipId: string;
  errorCode: MembershipAcceptErrorCode;
  correlationId: string;
}

export async function recordMembershipAcceptFailure(
  input: MembershipAcceptFailureInput,
): Promise<void> {
  try {
    const service = createSupabaseServiceClient();
    const { error } = await service.rpc("app_record_membership_accept_failure", {
      p_actor_user_id: input.actorUserId,
      p_membership_id: input.membershipId,
      p_error_code: input.errorCode,
      p_correlation_id: input.correlationId,
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

/**
 * Supabase/Postgres エラーを DB 許可リスト内の安全な error_code へ正規化する。
 * 許可リスト外・不明なエラーはすべて 'unexpected_error'（内部詳細は載せない）。
 */
export function toSafeErrorCode(error: unknown): MembershipAcceptErrorCode {
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      for (const code of MEMBERSHIP_ACCEPT_ERROR_CODES) {
        if (code !== "unexpected_error" && message.includes(code)) return code;
      }
    }
  }
  return "unexpected_error";
}
