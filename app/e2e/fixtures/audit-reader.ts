/**
 * B13-HTTP 用: 権威監査ログの読み取りヘルパー（E2E テスト専用）。
 * FICTIONAL / LOCAL ONLY / PRODUCTION USE PROHIBITED（CLAUDE.md §32）
 *
 * なぜ SYSTEM_ADMIN セッションで読むのか:
 *   migration 0001 は authoritative_audit_logs に対し
 *     revoke all ... from anon, authenticated, service_role;
 *     grant select ... to authenticated;
 *   としており、**service_role にはテーブル SELECT 権限が無い**
 *   （BYPASSRLS はテーブル GRANT を代替しない。実測: permission denied for table）。
 *   したがって監査行の読み取り経路は RLS ポリシー audit_select_system_admin を通る
 *   認証済み SYSTEM_ADMIN セッションのみ。GRANT / RLS / migration は一切変更しない。
 *
 *   service_role は「失敗監査 RPC の実行」にのみ使う（EXECUTE は service_role 限定）。
 *
 * セッション取得は auth.setup.ts / verify-supabase.ts と同じ方式（GoTrue Admin API の
 * generateLink → verifyOtp。メールは送らない）。**signOut は呼ばない** — /auth/signout と
 * 同じ global scope で seeded SYSTEM_ADMIN の storageState まで失効させてしまうため。
 *
 * 秘密情報（token_hash / access token / Cookie / Magic Link URL / 各種 key）は
 * 一切ログへ出さない。失敗時も describeError / describePostgrestError の範囲のみ報告する。
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assertLoopback,
  describeError,
  describePostgrestError,
  loadDotEnvLocal,
  requireEnv,
} from "./env";

const NOAUTH = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

export interface MembershipAcceptAuditRow {
  action: string;
  actorUserId: string | null;
  organizationId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  success: boolean;
  errorCode: string | null;
  correlationId: string | null;
}

export interface AuditReader {
  /** action='membership.accept' の監査行を resource_id で取得（成功・失敗の両方） */
  byResourceId(resourceId: string): Promise<MembershipAcceptAuditRow[]>;
  /** email から user_profiles.id を解決（SYSTEM_ADMIN の RLS 経由） */
  userIdByEmail(email: string): Promise<string>;
  /** service_role で失敗監査 RPC を直接呼ぶ（SEC-83 ガードの確認用） */
  callFailureAuditRpc(input: {
    actorUserId: string;
    membershipId: string;
    errorCode: string;
    correlationId: string;
  }): Promise<{ ok: boolean; guardRefused: boolean; note: string }>;
}

const ACTOR_MEMBERSHIP_MISMATCH_GUARD = "audit_actor_membership_mismatch";

const AUDIT_COLUMNS =
  "action, actor_user_id, organization_id, resource_type, resource_id, success, error_code, correlation_id";

/**
 * SYSTEM_ADMIN セッション（読み取り用）と service_role クライアント（RPC 用）を作る。
 * Magic Link は GoTrue Admin API の generateLink で発行し、メールは送らない。
 */
export async function createAuditReader(
  systemAdminEmail: string,
): Promise<AuditReader> {
  loadDotEnvLocal();
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  assertLoopback(url);
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const service: SupabaseClient = createClient(url, serviceKey, NOAUTH);

  const link = await service.auth.admin.generateLink({
    type: "magiclink",
    email: systemAdminEmail,
  });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) {
    throw new Error(
      `audit-reader: generateLink failed for the seeded SYSTEM_ADMIN: ${describeError(link.error)}`,
    );
  }

  // auth.setup.ts と同じ順序（type:"email" → magiclink フォールバック）。token はログしない。
  const reader: SupabaseClient = createClient(url, anonKey, NOAUTH);
  let verified = await reader.auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  });
  if (verified.error) {
    verified = await reader.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
  }
  if (verified.error || !verified.data.session) {
    throw new Error(
      `audit-reader: SYSTEM_ADMIN session could not be established: ${describeError(verified.error)}`,
    );
  }

  return {
    async byResourceId(resourceId: string) {
      const { data, error } = await reader
        .from("authoritative_audit_logs")
        .select(AUDIT_COLUMNS)
        .eq("action", "membership.accept")
        .eq("resource_id", resourceId);
      if (error) {
        throw new Error(
          `audit-reader: select failed: ${describePostgrestError(error)}`,
        );
      }
      return (data ?? []).map((r) => ({
        action: r.action as string,
        actorUserId: r.actor_user_id as string | null,
        organizationId: r.organization_id as string | null,
        resourceType: r.resource_type as string | null,
        resourceId: r.resource_id as string | null,
        success: r.success as boolean,
        errorCode: r.error_code as string | null,
        correlationId: r.correlation_id as string | null,
      }));
    },

    async userIdByEmail(email: string) {
      const { data, error } = await reader
        .from("user_profiles")
        .select("id")
        .eq("email", email)
        .limit(1);
      const id = data?.[0]?.id;
      if (error || typeof id !== "string") {
        throw new Error(
          `audit-reader: user_profiles lookup failed for a fixture identity: ${describePostgrestError(error)}`,
        );
      }
      return id;
    },

    async callFailureAuditRpc(input) {
      const { error } = await service.rpc(
        "app_record_membership_accept_failure",
        {
          p_actor_user_id: input.actorUserId,
          p_membership_id: input.membershipId,
          p_error_code: input.errorCode,
          p_correlation_id: input.correlationId,
        },
      );
      const guardRefused =
        !!error &&
        typeof error.message === "string" &&
        error.message.includes(ACTOR_MEMBERSHIP_MISMATCH_GUARD);
      return {
        ok: !error,
        guardRefused,
        note: error
          ? guardRefused
            ? `db=${ACTOR_MEMBERSHIP_MISMATCH_GUARD}`
            : describePostgrestError(error)
          : "accepted",
      };
    },
  };
}
