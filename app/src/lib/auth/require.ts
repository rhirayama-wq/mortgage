/**
 * route group / layout 単位のサーバー認可ヘルパー（CLAUDE.md §18）。
 * middleware の認証チェックには依存せず、各 layout で毎回サーバー検証する。
 *
 * 注意: next/navigation の redirect() / notFound() は例外を throw するため、
 * try/catch の外で呼ぶ（catch すると redirect が失われる）。
 */

import { notFound, redirect } from "next/navigation";
import { getCurrentAccess, type CurrentAccess } from "./membership";
import { isUuid } from "./validators";
import {
  canAccessOrgApp,
  canAccessSystemConsole,
  decideLanding,
  routeForDecision,
  activeMemberships,
  type AccessContext,
} from "./access";
import {
  loadCustomerCaseView,
  type CustomerCaseView,
} from "../customer-cases/queries";

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

/** 認証済みであることのみ要求（no-access / pending-invitation / 顧客ポータル用） */
export async function requireAuthenticated(): Promise<AccessContext> {
  const result = await loadAccess();
  if (!result.ok) redirect("/error");
  if (!result.access.authenticated) redirect("/login");
  return result.access.ctx;
}

/**
 * 顧客（organization 非所属の申込者本人）向け: 認証済みユーザーの最小情報。
 * membership は要求しない（顧客は case_participants 経由でアクセスする）。
 */
export async function requireAuthenticatedUser(): Promise<{
  userId: string;
  email: string;
  displayName: string | null;
}> {
  const ctx = await requireAuthenticated();
  return {
    userId: ctx.profile.userId,
    email: ctx.profile.email,
    displayName: ctx.profile.displayName,
  };
}

/**
 * 顧客本人が当該案件の participant であることを要求し、本人ビューを返す。
 * - 未認証: /login（requireAuthenticated 経由）
 * - DB / 整合性障害: /error（fail closed。未参加と混同しない）
 * - 未参加 / 不存在 / 不正 ID: notFound()（他案件の存在を漏らさない）
 */
export async function requireCustomerCaseParticipant(
  caseId: string,
): Promise<CustomerCaseView> {
  await requireAuthenticated();
  if (!isUuid(caseId)) notFound();

  let view: CustomerCaseView | null;
  try {
    view = await loadCustomerCaseView(caseId);
  } catch (e) {
    console.error(
      "[customer-case] participant load failed:",
      e instanceof Error ? `${e.name}` : "unknown",
    );
    redirect("/error");
  }
  if (!view) notFound();
  return view;
}

/** 法人アプリ: active membership 必須 */
export async function requireOrgAccess(): Promise<{
  ctx: AccessContext;
  organizationId: string;
  organizationName: string | null;
  /** 選択された法人における本人の active membership（案件の担当割当等に使用）。 */
  membershipId: string;
  role: "ORGANIZATION_ADMIN" | "SALES_USER";
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
  const membership =
    actives.find((m) => m.organizationId === organizationId) ?? actives[0];
  return {
    ctx,
    organizationId,
    organizationName: membership.organizationName ?? null,
    membershipId: membership.membershipId,
    role: membership.role,
  };
}

/**
 * Server Component のデータ取得を fail closed でラップする。
 * DB / 整合性障害（DataAccessError / DataIntegrityError 等）は /error へ送り、
 * 「所属なし/未参加」と混同しない（CLAUDE.md §18/§34）。
 */
export async function orErrorPage<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    console.error(
      "[page] data load failed:",
      e instanceof Error ? `${e.name}` : "unknown",
    );
    redirect("/error");
  }
}

/** SYSTEM_ADMIN 画面: user_profiles.system_role 必須 */
export async function requireSystemAdmin(): Promise<AccessContext> {
  const ctx = await requireAuthenticated();
  if (!canAccessSystemConsole(ctx)) {
    redirect(routeForDecision(decideLanding(ctx)));
  }
  return ctx;
}
