/**
 * 法人アプリ route group layout。
 * ここでサーバー認可を毎回実施する: 認証済み + active membership 必須
 * （middleware の認証チェックだけに依存しない: CLAUDE.md §18）。
 * Phase 2A-W1: organization context 確定後に自法人ブランドを解決し、CSS variables を
 * server-render で出力する（ちらつき/テナント混線なし）。ブランド取得失敗は標準へフォールバック。
 */

import Link from "next/link";
import { requireOrgAccess } from "@/lib/auth/require";
import { SignoutButton } from "@/components/signout-button";
import {
  loadOrgResolvedBrand,
  defaultResolvedBrand,
  brandStyleVars,
} from "@/lib/branding/queries";

export const dynamic = "force-dynamic";

export default async function OrgAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { ctx, organizationId, organizationName, role } = await requireOrgAccess();

  const fallbackName = organizationName ?? "所属法人";
  let brand;
  try {
    brand = await loadOrgResolvedBrand(organizationId, fallbackName);
  } catch {
    brand = defaultResolvedBrand(fallbackName);
  }

  return (
    <div
      className="min-h-screen"
      style={brandStyleVars(brand.tokens) as React.CSSProperties}
    >
      <header
        className="flex items-center justify-between border-b border-slate-200 px-6 py-3"
        style={{ background: "var(--brand-primary-soft)" }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logoUrl}
                alt={brand.displayName}
                className="h-6 w-auto max-w-[140px] object-contain"
              />
            ) : null}
            <span className="text-sm font-semibold">{brand.displayName}</span>
          </div>
          <nav className="flex items-center gap-3 text-xs text-slate-600">
            <Link href="/cases" className="hover:text-slate-900 hover:underline">
              案件
            </Link>
            <Link
              href="/settings/partner-loans"
              className="hover:text-slate-900 hover:underline"
            >
              提携ローン
            </Link>
            {role === "ORGANIZATION_ADMIN" ? (
              <Link
                href="/settings/branding"
                className="hover:text-slate-900 hover:underline"
              >
                ブランディング
              </Link>
            ) : null}
          </nav>
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
