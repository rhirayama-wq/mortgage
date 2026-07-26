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
 * - actor は membership 本人でなければならない（SEC-83/84 偽造防止ガード）
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

/**
 * 失敗監査書込みの結果。
 * - "recorded"         : 監査行が記録された（同一 correlation の冪等衝突を含む）
 * - "refused_by_guard" : DB 側の偽造防止ガードが設計どおり拒否した（監査行なしが正しい）
 * - "write_failed"     : 監査経路そのものの障害（運用アラート対象）
 */
export type MembershipAcceptFailureAuditResult =
  | "recorded"
  | "refused_by_guard"
  | "write_failed";

/**
 * DB 側の偽造防止ガード名（migration 0001 app_record_membership_accept_failure、
 * errcode 22023）。actor が membership 本人でない場合に raise される（SEC-83/84）。
 */
const ACTOR_MEMBERSHIP_MISMATCH_GUARD = "audit_actor_membership_mismatch";

/**
 * 監査 RPC のエラーが「設計どおりの拒否」か「監査経路の障害」かを判定する。
 *
 * 他人の membership ID を送り付けられた場合、業務 RPC は not_authorized で拒否し、
 * 続く失敗監査 RPC も SEC-83 ガードで拒否する（監査行を書かないことが正しい）。
 * これを監査書込み障害と同じログで扱うと、本物の監査障害を覆い隠す。
 *
 * 判定できないエラーは write_failed 側（＝大きく鳴らす方）へ倒す（fail-open にしない）。
 */
export function isActorMembershipMismatchError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    message.includes(ACTOR_MEMBERSHIP_MISMATCH_GUARD)
  );
}

export async function recordMembershipAcceptFailure(
  input: MembershipAcceptFailureInput,
): Promise<MembershipAcceptFailureAuditResult> {
  try {
    const service = createSupabaseServiceClient();
    const { error } = await service.rpc("app_record_membership_accept_failure", {
      p_actor_user_id: input.actorUserId,
      p_membership_id: input.membershipId,
      p_error_code: input.errorCode,
      p_correlation_id: input.correlationId,
    });
    if (!error) return "recorded";

    if (isActorMembershipMismatchError(error)) {
      // 設計どおりの拒否。監査行が無いことが正しい挙動であり、監査障害ではない。
      // ただし他人の membership ID の送信自体はセキュリティ事象なので記録は残す。
      // 出すのは correlation ID のみ（actor / membership / メール / token は出さない）。
      console.warn(
        `[audit] failure-audit refused by actor/membership guard (no row written, by design) correlation=${input.correlationId}`,
      );
      return "refused_by_guard";
    }

    // 監査記録自体の失敗は correlation ID のみでログする（PIIなし）
    console.error(
      `[audit] failure-audit write failed correlation=${input.correlationId}`,
    );
    return "write_failed";
  } catch {
    console.error(
      `[audit] failure-audit unexpected error correlation=${input.correlationId}`,
    );
    return "write_failed";
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
