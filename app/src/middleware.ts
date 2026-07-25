/**
 * middleware（CLAUDE.md §18）
 * 責務: セッション refresh / 認証有無の確認 / Cookie 反映 / 未認証リダイレクト。
 * 業務認可（membership / role / system_role）はここで完了させず、
 * 各 route group の layout がサーバー側で毎回検証する。
 */

import { type NextRequest } from "next/server";
import {
  updateSession,
  redirectWithAuthCookies,
} from "@/lib/supabase/middleware";
import { getSafeInternalPath } from "@/lib/auth/safe-next";

// /auth/signout は「未認証リダイレクトの対象にしない」パスに含める。
// これを含めないと、未認証の GET/POST /auth/signout が middleware に捕捉され
// route handler へ到達する前に 307 で /login へ飛んでしまう（GET=405 / POST=303 の
// 契約を handler が返せない）。updateSession による Cookie refresh は引き続き実行され、
// 通常の保護ルート判定（他パス）には影響しない。
const PUBLIC_PATHS = new Set<string>([
  "/login",
  "/auth/callback",
  "/auth/signout",
  "/error",
]);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  // 未認証: 公開パス以外は /login へ（元のパスは安全に next へ引き継ぐ）
  if (!user && !isPublicPath(pathname)) {
    const next = getSafeInternalPath(pathname + search);
    const url = new URL("/login", request.url);
    if (next !== "/") url.searchParams.set("next", next);
    return redirectWithAuthCookies(response, url);
  }

  // 認証済みで /login へ来た場合はルートへ（landing 判定はサーバーで実施）
  if (user && pathname === "/login") {
    const next = getSafeInternalPath(request.nextUrl.searchParams.get("next"));
    return redirectWithAuthCookies(response, new URL(next, request.url));
  }

  // refresh 済み Cookie を含むレスポンスを必ず返す
  return response;
}

export const config = {
  matcher: [
    // 静的アセットを除く全ルート
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
