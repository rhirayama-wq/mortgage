/**
 * /customer/cases/[caseId] 配下の case-scoped ブランド layout（Phase 2A-W1）。
 * - 当該案件の organization の公開ブランドを case-scoped safe RPC で解決し、CSS variables を出力。
 * - 認可はここで新たに強制も緩和もしない。各 page が participant 認可を担保する
 *   （requireCustomerCaseParticipant / requireCustomerCaseEmploymentIncome）。
 * - ブランド解決は防御的: 非 participant/未設定/障害いずれも標準ブランドへフォールバックし、
 *   例外を投げない（案件の存在有無を未認可ユーザーへ漏らさない・DB 障害を not-found 化しない）。
 * - 顧客ポータル一覧(/customer/cases)はこの layout の外側のため標準テーマのまま。
 */

import { isUuid } from "@/lib/auth/validators";
import {
  loadCaseResolvedBrand,
  defaultResolvedBrand,
  brandStyleVars,
  type ResolvedBrand,
} from "@/lib/branding/queries";
import { DEFAULT_BRAND } from "@/lib/branding/branding";

export const dynamic = "force-dynamic";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ caseId: string }>;
}

export default async function CustomerCaseBrandLayout({
  children,
  params,
}: LayoutProps) {
  const { caseId } = await params;

  let brand: ResolvedBrand = defaultResolvedBrand(DEFAULT_BRAND.displayName);
  if (isUuid(caseId)) {
    try {
      brand = await loadCaseResolvedBrand(caseId);
    } catch {
      brand = defaultResolvedBrand(DEFAULT_BRAND.displayName);
    }
  }

  return (
    <div style={brandStyleVars(brand.tokens) as React.CSSProperties}>
      <div
        className="mb-4 flex items-center gap-2 rounded border border-slate-200 px-3 py-2"
        style={{ background: "var(--brand-primary-soft)" }}
      >
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
      {children}
    </div>
  );
}
