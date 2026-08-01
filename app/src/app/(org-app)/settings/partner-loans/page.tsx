/**
 * /settings/partner-loans — 提携ローン管理一覧。
 * ORGANIZATION_ADMIN: 全 status + サマリー + 登録/編集導線。
 * SALES_USER: 自 org の有効商品の閲覧のみ（編集 CTA なし・定義者関数経由・内部メモ非表示）。
 * 認可は (org-app)/layout.tsx（active membership）+ 本ページの role 分岐 + RLS/RPC。
 */

import Link from "next/link";
import { requireOrgAccess, orErrorPage } from "@/lib/auth/require";
import {
  loadPartnerLoanAdminList,
  summarizePartnerLoans,
  loadSalesActivePartnerLoans,
} from "@/lib/partner-loans/queries";
import {
  partnerLoanStatusLabel,
  interestRateTypeLabel,
  formatBpsAsPercent,
  formatYen,
  formatDate,
} from "@/lib/partner-loans/labels";
import { isInterestRateType } from "@/lib/partner-loans/types";

export const dynamic = "force-dynamic";

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

export default async function PartnerLoansPage() {
  const { organizationId, role } = await requireOrgAccess();
  const isAdmin = role === "ORGANIZATION_ADMIN";

  if (!isAdmin) {
    const items = await orErrorPage(() =>
      loadSalesActivePartnerLoans(organizationId),
    );
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-lg font-semibold">提携ローン（閲覧）</h1>
        <p className="mb-4 text-sm text-slate-600">
          自社が提携している有効な住宅ローン商品です。顧客への提案にご利用いただけます。
        </p>
        {items.length === 0 ? (
          <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">
            有効な提携ローンはありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((it) => (
              <li
                key={it.partnerLoanId}
                className="rounded border border-slate-200 bg-white p-4 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{it.displayName}</span>
                  <span className="text-xs text-slate-500">{it.institutionName}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>商品: {it.productName}</span>
                  <span>
                    金利:{" "}
                    {isInterestRateType(it.interestRateType)
                      ? interestRateTypeLabel(it.interestRateType)
                      : it.interestRateType}
                  </span>
                  <span>参考金利: {formatBpsAsPercent(it.indicativeRateBps)}</span>
                  <span>最大借入: {formatYen(it.maximumLoanAmountYen)}</span>
                  <span>
                    有効期間: {formatDate(it.validFrom)} 〜 {formatDate(it.validUntil)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const items = await orErrorPage(() => loadPartnerLoanAdminList(organizationId));
  const summary = summarizePartnerLoans(items, Date.now());

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-lg font-semibold">提携ローン管理</h1>
        <Link
          href="/settings/partner-loans/new"
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          新しい提携ローンを登録
        </Link>
      </div>
      <p className="mb-4 text-sm text-slate-600">
        自社が提携している住宅ローン商品を登録・管理できます。登録した商品もモゲチェック診断の対象になります。
      </p>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <SummaryCard label="登録数" value={summary.total} />
        <SummaryCard label="有効" value={summary.active} />
        <SummaryCard label="下書き" value={summary.draft} />
        <SummaryCard label="要確認" value={summary.needsConfirmation} />
        <SummaryCard label="期限間近" value={summary.expiringSoon} />
      </div>

      {items.length === 0 ? (
        <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">
          提携ローンはまだありません。「新しい提携ローンを登録」から作成してください。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.id}>
              <Link
                href={`/settings/partner-loans/${it.id}`}
                className="block rounded border border-slate-200 bg-white p-4 hover:border-slate-400"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{it.displayName}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {partnerLoanStatusLabel(it.status)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>{it.institutionName}</span>
                  {it.currentVersion ? (
                    <>
                      <span>商品: {it.currentVersion.productName}</span>
                      <span>
                        参考金利:{" "}
                        {formatBpsAsPercent(it.currentVersion.indicativeRateBps)}
                      </span>
                      <span>
                        最大借入:{" "}
                        {formatYen(it.currentVersion.maximumLoanAmountYen)}
                      </span>
                      <span>v{it.currentVersion.versionNumber}</span>
                    </>
                  ) : (
                    <span>バージョン未作成</span>
                  )}
                  <span>最終確認: {formatDate(it.lastConfirmedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
