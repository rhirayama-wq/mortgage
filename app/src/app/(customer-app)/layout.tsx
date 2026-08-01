/**
 * 顧客ポータル route group layout。
 * 認証のみを要求する（顧客は organization 非所属。案件アクセスは case_participants 経由で
 * 各ページ/RLS が担保する）。middleware の認証チェックだけに依存しない（CLAUDE.md §18）。
 */

import { requireAuthenticatedUser } from "@/lib/auth/require";
import { SignoutButton } from "@/components/signout-button";

export const dynamic = "force-dynamic";

export default async function CustomerAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAuthenticatedUser();

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold">住宅ローン お客様ポータル</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-600">
            {user.displayName ?? user.email}
          </span>
          <SignoutButton />
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
