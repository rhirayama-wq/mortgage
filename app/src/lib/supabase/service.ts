/**
 * service_role クライアント（サーバー専用）。
 * 用途は失敗監査 (app_record_membership_accept_failure 等の専用関数) の別トランザクション記録のみ
 * （CLAUDE.md §19）。RLS バイパス能力を持つため、他用途へ流用しない。
 */

import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseServiceRoleKey } from "../env";

export function createSupabaseServiceClient() {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
