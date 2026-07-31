/**
 * Loan Checker MoC 専用レイアウト。
 * 重要: ここでは requireOrgAccess を呼ばない（MoC 方針）。
 * middleware による認証チェックは通過するが、業務認可は行わない閲覧用デモ。
 * 既存の (org-app) / (system) の認可構成には一切影響しない。
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { DemoProvider } from "@/lib/loan-checker-moc/store";
import {
  DemoBanner,
  RoleSwitcher,
} from "@/components/loan-checker-moc/demo-chrome";

export const dynamic = "force-dynamic";

export default function LoanCheckerMocLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DemoProvider>
      <div className="min-h-screen bg-slate-50">
        <DemoBanner />
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
            <Link href="/loan-checker" className="text-sm font-bold text-slate-900">
              モゲチェック <span className="text-sky-700">Loan Checker</span>
            </Link>
            <RoleSwitcher />
          </div>
        </div>
        {children}
      </div>
    </DemoProvider>
  );
}
