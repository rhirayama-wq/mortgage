/**
 * 法人アプリ route group layout。
 * ここでサーバー認可を毎回実施する: 認証済み + active membership 必須
 * （middleware の認証チェックだけに依存しない: CLAUDE.md §18）。
 */

import { requireOrgAccess } from "@/lib/auth/require";
import { SignoutButton } from "@/components/signout-button";

export const dynamic = "force-dynamic";

export default async function OrgAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { ctx, organizationName } = await requireOrgAccess();

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold">
            {organizationName ?? "所属法人"}
          </span>
          <span className="text-xs text-slate-500">住宅ローン検索 (MVP)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-600">
            {ctx.profile.displayName ?? ctx.profile.email}
          </span>
          <SignoutButton />
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
