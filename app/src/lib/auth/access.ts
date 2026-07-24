/**
 * 純粋なアクセス判定ロジック（unit test 対象・依存ゼロ）
 * 認証済みユーザーの profile / memberships から遷移先とアクセス可否を決める。
 * ここは判定のみを行い、データ取得・redirect は行わない。
 *
 * 未確定事項の暫定判断（docs/assumptions.md）:
 * - U2: 複数 active 所属時は組織名の辞書順で先頭を暫定選択
 * - U3: SYSTEM_ADMIN は招待より system console を優先
 */

import type { MembershipRow, ProfileRow } from "./validators";

export interface AccessContext {
  profile: ProfileRow;
  memberships: MembershipRow[];
}

export type AccessDecision =
  | { kind: "system-console" }
  | { kind: "org-app"; organizationId: string }
  | { kind: "pending-invitation" }
  | { kind: "no-access" };

export function activeMemberships(ctx: AccessContext): MembershipRow[] {
  return ctx.memberships.filter((m) => m.status === "active");
}

export function invitedMemberships(ctx: AccessContext): MembershipRow[] {
  return ctx.memberships.filter((m) => m.status === "invited");
}

export function isSystemAdmin(ctx: AccessContext): boolean {
  return ctx.profile.systemRole === "SYSTEM_ADMIN";
}

/** 法人アプリへ入れるか（active membership 必須） */
export function canAccessOrgApp(ctx: AccessContext): boolean {
  return activeMemberships(ctx).length > 0;
}

/** SYSTEM_ADMIN 画面へ入れるか */
export function canAccessSystemConsole(ctx: AccessContext): boolean {
  return isSystemAdmin(ctx);
}

/** 招待画面へ入れるか（本人の invited membership がある） */
export function canAccessPendingInvitation(ctx: AccessContext): boolean {
  return invitedMemberships(ctx).length > 0;
}

/**
 * ログイン後の遷移先判定。
 * 優先順位:
 *  1. SYSTEM_ADMIN -> system console（U3 暫定。SYSTEM_ADMIN 単独では法人アプリへ入らない）
 *  2. active membership あり -> 法人アプリ
 *  3. invited のみ -> 招待受諾画面
 *  4. いずれもなし -> no-access
 */
export function decideLanding(ctx: AccessContext): AccessDecision {
  if (isSystemAdmin(ctx)) {
    return { kind: "system-console" };
  }
  const actives = activeMemberships(ctx);
  if (actives.length > 0) {
    const sorted = [...actives].sort((a, b) => {
      const an = a.organizationName ?? "";
      const bn = b.organizationName ?? "";
      if (an !== bn) return an < bn ? -1 : 1;
      return a.organizationId < b.organizationId ? -1 : 1;
    });
    return { kind: "org-app", organizationId: sorted[0].organizationId };
  }
  if (invitedMemberships(ctx).length > 0) {
    return { kind: "pending-invitation" };
  }
  return { kind: "no-access" };
}

/** 判定結果に対応するルート */
export function routeForDecision(decision: AccessDecision): string {
  switch (decision.kind) {
    case "system-console":
      return "/system-console";
    case "org-app":
      return "/cases";
    case "pending-invitation":
      return "/pending-invitation";
    case "no-access":
      return "/no-access";
  }
}
