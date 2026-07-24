/**
 * Server Component / Server Action / Route Handler 用 Supabase クライアント。
 * Server Component からは Cookie を書けないため、セッション refresh の唯一の
 * 書込経路は middleware（src/middleware.ts）とする（CLAUDE.md §18）。
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey } from "../env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component からの呼出しでは Cookie を書けない。
          // refresh は middleware が担うため無視してよい。
        }
      },
    },
  });
}
