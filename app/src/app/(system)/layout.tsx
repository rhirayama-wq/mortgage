/**
 * SYSTEM_ADMIN route group layout。
 * ここでサーバー認可を毎回実施する: user_profiles.system_role = SYSTEM_ADMIN 必須。
 * 法人アプリとは認可を分離する（SYSTEM_ADMIN 単独では法人アプリへ入れない）。
 */

import { requireSystemAdmin } from "@/lib/auth/require";
import { SignoutButton } from "@/components/signout-button";

export const dynamic = "force-dynamic";

export default async function SystemLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requireSystemAdmin();

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-amber-300 bg-amber-50 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold">システム管理コンソール</span>
          <span className="text-xs text-amber-700">SYSTEM_ADMIN</span>
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
