/**
 * route group / layout 単位のサーバー認可ヘルパー（CLAUDE.md §18）。
 * middleware の認証チェックには依存せず、各 layout で毎回サーバー検証する。
 *
 * 注意: next/navigation の redirect() は例外を throw するため、
 * try/catch の外で呼ぶ（catch すると redirect が失われる）。
 */

import { redirect } from "next/navigation";
import { getCurrentAccess, type CurrentAccess } from "./membership";
import {
  canAccessOrgApp,
  canAccessSystemConsole,
  decideLanding,
  routeForDecision,
  activeMemberships,
  type AccessContext,
} from "./access";

type LoadResult =
  | { ok: true; access: CurrentAccess }
  | { ok: false };

async function loadAccess(): Promise<LoadResult> {
  try {
    return { ok: true, access: await getCurrentAccess() };
  } catch (e) {
    // AuthSessionError / DataAccessError / DataIntegrityError:
    // 障害は「所属なし」と区別し /error へ（fail closed）
    console.error(
      "[auth] access resolution failed:",
      e instanceof Error ? `${e.name}` : "unknown",
    );
    return { ok: false };
  }
}

/** 認証済みであることのみ要求（no-access / pending-invitation 用） */
export async function requireAuthenticated(): Promise<AccessContext> {
  const result = await loadAccess();
  if (!result.ok) redirect("/error");
  if (!result.access.authenticated) redirect("/login");
  return result.access.ctx;
}

/** 法人アプリ: active membership 必須 */
export async function requireOrgAccess(): Promise<{
  ctx: AccessContext;
  organizationId: string;
  organizationName: string | null;
}> {
  const ctx = await requireAuthenticated();
  if (!canAccessOrgApp(ctx)) {
    redirect(routeForDecision(decideLanding(ctx)));
  }
  const actives = activeMemberships(ctx);
  // U2 暫定: 複数 active は decideLanding と同一の決定的順序で先頭を採用
  const decision = decideLanding(ctx);
  const organizationId =
    decision.kind === "org-app"
      ? decision.organizationId
      : actives[0].organizationId;
  const organizationName =
    actives.find((m) => m.organizationId === organizationId)
      ?.organizationName ?? null;
  return { ctx, organizationId, organizationName };
}

/** SYSTEM_ADMIN 画面: user_profiles.system_role 必須 */
export async function requireSystemAdmin(): Promise<AccessContext> {
  const ctx = await requireAuthenticated();
  if (!canAccessSystemConsole(ctx)) {
    redirect(routeForDecision(decideLanding(ctx)));
  }
  return ctx;
}
