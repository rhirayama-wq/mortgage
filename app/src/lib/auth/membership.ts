/**
 * 認証ユーザー・profile・membership のサーバー側取得（CLAUDE.md §18）。
 *
 * 重要:
 * - profile / membership の DB エラーを「所属なし」とみなさない。
 *   DataAccessError として送出し、呼出し側は /error（500系）へ送る。
 * - 取得値は型キャストせず、実行時検証（validators.ts）を通す。
 */

import { createSupabaseServerClient } from "../supabase/server";
import { AuthSessionError, DataAccessError, DataIntegrityError } from "./errors";
import {
  parseMembershipRow,
  parseProfileRow,
  ValidationError,
} from "./validators";
import type { AccessContext } from "./access";

export type CurrentAccess =
  | { authenticated: false }
  | { authenticated: true; ctx: AccessContext };

/**
 * 現在のリクエストのアクセスコンテキストを解決する。
 * - 未認証（トークンなし・無効）: { authenticated: false }
 * - DB / RLS / 整合性エラー: DataAccessError / DataIntegrityError を throw
 *   （呼出し側で /error へ。no-access へ送ってはならない）
 */
export async function getCurrentAccess(): Promise<CurrentAccess> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    // 無効・期限切れセッションは通常の未認証として扱う
    const status = (userError as { status?: number }).status;
    if (status === 400 || status === 401 || status === 403) {
      return { authenticated: false };
    }
    // それ以外（ネットワーク・Auth サービス障害）は専用エラー
    throw new AuthSessionError();
  }
  if (!user) {
    return { authenticated: false };
  }

  // profile 取得: エラーは「所属なし」ではなく DataAccessError
  const profileResult = await supabase
    .from("user_profiles")
    .select("id, email, display_name, system_role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileResult.error) {
    throw new DataAccessError("failed to load user profile");
  }
  if (!profileResult.data) {
    // auth.users トリガーで必ず作成されるはず。欠落は障害として fail closed。
    throw new DataIntegrityError("user profile is missing");
  }

  // membership 取得: left は取得対象外（終端状態）
  const membershipResult = await supabase
    .from("organization_memberships")
    .select(
      "id, organization_id, role, status, invited_email, organizations ( name )",
    )
    .eq("user_id", user.id)
    .neq("status", "left");

  if (membershipResult.error) {
    throw new DataAccessError("failed to load memberships");
  }

  try {
    const profile = parseProfileRow(profileResult.data);
    const memberships = (membershipResult.data ?? []).map(parseMembershipRow);
    return { authenticated: true, ctx: { profile, memberships } };
  } catch (e) {
    if (e instanceof ValidationError) {
      // 想定外の値は fail closed（権限なしではなく障害として扱う）
      throw new DataIntegrityError(e.message);
    }
    throw e;
  }
}
