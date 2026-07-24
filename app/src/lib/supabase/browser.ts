"use client";

/**
 * ブラウザ用 Supabase クライアント。
 * Magic Link 送信・認可判断には使用しない（サーバーへ集約: CLAUDE.md §17, §18）。
 */

import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey } from "../env";

export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
