/**
 * Server Component / Server Action / Route Handler 用 Supabase クライアント。
 * Server Component からは Cookie を書けないため、セッション refresh の唯一の
 * 書込経路は middleware（src/middleware.ts）とする（CLAUDE.md §18）。
 */

import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey } from "../env";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            // @supabase/ssr は httpOnly=false で書く（ブラウザ側クライアントが読む前提）が、
            // 本アプリはクライアント側 Supabase を使用しないため httpOnly を強制する
            // （CLAUDE.md §17/§18/§23。assumptions.md U22: クライアント側利用を始める場合は再検討）。
            cookieStore.set(name, value, { ...options, httpOnly: true });
          }
        } catch {
          // Server Component からの呼出しでは Cookie を書けない。
          // refresh は middleware が担うため無視してよい。
        }
      },
    },
  });
}
