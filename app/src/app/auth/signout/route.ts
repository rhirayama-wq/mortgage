/**
 * /auth/signout — POST のみ（CLAUDE.md §17: GET で状態変更しない）
 * GET ハンドラは定義しない（Next.js が 405 を返す）。
 */

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.nextUrl.origin), {
    status: 303,
  });
}
