/**
 * /auth/callback — Magic Link callback（CLAUDE.md §17 / AUTH-07..10）
 * - token_hash + type の OTP 検証フローのみを受け付ける
 *   （Supabase メールテンプレートは {{ .TokenHash }} を用いた SSR 推奨形式にする）
 * - type は実行時検証: 通常ログインは email / magiclink のみ。
 *   recovery / invite / signup はこの callback では受け付けない（用途別に分離）
 * - next は安全な内部パスのみ（open redirect 防止・login 側と二重検証）
 * - 失敗は詳細を出さず /login?e=link へ（使用済み・失効リンクを含む）
 */

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseLoginOtpType } from "@/lib/auth/otp";
import { getSafeInternalPath } from "@/lib/auth/safe-next";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = parseLoginOtpType(url.searchParams.get("type"));
  const next = getSafeInternalPath(url.searchParams.get("next"));

  if (!tokenHash || tokenHash.length < 1 || tokenHash.length > 512 || !otpType) {
    return NextResponse.redirect(new URL("/login?e=link", url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    type: otpType,
    token_hash: tokenHash,
  });

  if (error) {
    // 使用済みリンク・期限切れ・改ざんを区別せず同一応答（内部詳細は出さない）
    return NextResponse.redirect(new URL("/login?e=link", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
