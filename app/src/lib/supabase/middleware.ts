/**
 * middleware でのセッション refresh（CLAUDE.md §18）。
 * - getUser() でトークンを検証・必要なら refresh する
 * - refresh された Cookie は response に反映される
 * - redirect する場合は copyAuthCookies で新しい redirect レスポンスへ
 *   Cookie を引き継ぐ（redirect 時の Cookie 喪失＝旧ブロッカー#1 の対策）
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { supabaseUrl, supabaseAnonKey } from "../env";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export interface SessionResult {
  response: NextResponse;
  user: User | null;
}

export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser はトークンを Auth サーバーで検証する（getSession は使わない）
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response: supabaseResponse, user };
}

/**
 * refresh 済み認証 Cookie を redirect レスポンスへ引き継ぐ。
 * これを通さない redirect を middleware から返してはならない。
 */
export function redirectWithAuthCookies(
  sessionResponse: NextResponse,
  url: URL,
): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  for (const cookie of sessionResponse.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  return redirectResponse;
}
