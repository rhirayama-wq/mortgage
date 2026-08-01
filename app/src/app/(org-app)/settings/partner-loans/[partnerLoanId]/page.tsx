/**
 * /settings/partner-loans/[partnerLoanId] — 提携ローン詳細（ORGANIZATION_ADMIN）。
 * 現在の有効 version と過去 version、有効化/無効化/確認済み/編集の導線を表示する。
 * SALES_USER は詳細を持たない（RLS で不可視 → notFound）。
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireOrgAccess, orErrorPage } from "@/lib/auth/require";
import { isUuid } from "@/lib/auth/validators";
import { loadPartnerLoanDetail } from "@/lib/partner-loans/queries";
import type { PartnerLoanVersionDetail } from "@/lib/partner-loans/queries";
import {
  partnerLoanStatusLabel,
  interestRateTypeLabel,
  handlingFeeTypeLabel,
  propertyTypeLabel,
  employmentTypeLabel,
  formatBpsAsPercent,
  formatYen,
  formatDate,
} from "@/lib/partner-loans/labels";
import {
  isInterestRateType,
  isHandlingFeeType,
  type PropertyType,
  type EmploymentType,
} from "@/lib/partner-loans/types";
import {
  activatePartnerLoan,
  deactivatePartnerLoan,
  confirmPartnerLoan,
} from "../actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ partnerLoanId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const NOTICE: Record<string, { kind: "ok" | "error"; text: string }> = {
  "created=1": { kind: "ok", text: "提携ローンを登録しました。" },
  "updated=1": { kind: "ok", text: "新しいバージョンを作成しました。" },
  "activated=1": { kind: "ok", text: "有効化しました。" },
  "deactivated=1": { kind: "ok", text: "無効化しました。" },
  "confirmed=1": { kind: "ok", text: "確認済みにしました。" },
  "e=conflict": {
    kind: "error",
    text: "他の更新と競合しました（バージョン競合）。最新の内容を確認してから再度お試しください。",
  },
  "e=action": { kind: "error", text: "操作を実行できませんでした。" },
};

function noticeKeyOf(sp: Record<string, string | string[] | undefined>): string {
  for (const k of ["created", "updated", "activated", "deactivated", "confirmed"]) {
    if (sp[k] === "1") return `${k}=1`;
  }
  if (typeof sp.e === "string") return `e=${sp.e}`;
  return "";
}

function VersionView({ v }: { v: PartnerLoanVersionDetail }) {
  const rate = isInterestRateType(v.interestRateType)
    ? interestRateTypeLabel(v.interestRateType)
    : v.interestRateType;
  const fee =
    v.handlingFeeType && isHandlingFeeType(v.handlingFeeType)
      ? v.handlingFeeType === "fixed_yen"
        ? `${handlingFeeTypeLabel(v.handlingFeeType)} ${formatYen(v.handlingFeeYen)}`
        : `${handlingFeeTypeLabel(v.handlingFeeType)} ${formatBpsAsPercent(v.handlingFeeBps)}`
      : "—";
  return (
    <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
      <dt className="text-slate-500">商品名</dt>
      <dd>{v.productName}</dd>
      <dt className="text-slate-500">金利タイプ</dt>
      <dd>{rate}</dd>
      <dt className="text-slate-500">参考適用金利</dt>
      <dd>{formatBpsAsPercent(v.indicativeRateBps)}</dd>
      <dt className="text-slate-500">基準金利 / 優遇幅</dt>
      <dd>
        {formatBpsAsPercent(v.baseRateBps)} / {formatBpsAsPercent(v.preferentialRateReductionBps)}
      </dd>
      <dt className="text-slate-500">借入額</dt>
      <dd>
        {formatYen(v.minimumLoanAmountYen)} 〜 {formatYen(v.maximumLoanAmountYen)}
      </dd>
      <dt className="text-slate-500">借入期間</dt>
      <dd>
        {v.minimumTermYears ?? "—"} 〜 {v.maximumTermYears ?? "—"} 年
      </dd>
      <dt className="text-slate-500">LTV 上限</dt>
      <dd>{formatBpsAsPercent(v.maximumLtvBps)}</dd>
      <dt className="text-slate-500">事務手数料</dt>
      <dd>{fee}</dd>
      <dt className="text-slate-500">物件種別</dt>
      <dd>
        {v.eligiblePropertyTypes.length > 0
          ? v.eligiblePropertyTypes
              .map((t) => propertyTypeLabel(t as PropertyType))
              .join("、")
          : "—"}
      </dd>
      <dt className="text-slate-500">対象エリア</dt>
      <dd>{v.eligibleAreas.length > 0 ? v.eligibleAreas.join("、") : "—"}</dd>
      <dt className="text-slate-500">年収 / 勤続</dt>
      <dd>
        {formatYen(v.minimumAnnualIncomeYen)} / {v.minimumEmploymentMonths ?? "—"} か月
      </dd>
      <dt className="text-slate-500">雇用形態</dt>
      <dd>
        {v.eligibleEmploymentTypes.length > 0
          ? v.eligibleEmploymentTypes
              .map((t) => employmentTypeLabel(t as EmploymentType))
              .join("、")
          : "—"}
      </dd>
      <dt className="text-slate-500">年齢条件</dt>
      <dd>
        {v.minimumAge ?? "—"} 歳 / 申込 {v.maximumApplicationAge ?? "—"} 歳 / 完済{" "}
        {v.maximumAgeAtMaturity ?? "—"} 歳
      </dd>
      <dt className="text-slate-500">団信</dt>
      <dd>{v.groupCreditLifeInsuranceSummary ?? "—"}</dd>
      <dt className="text-slate-500">顧客向け注意事項</dt>
      <dd>{v.customerDisclosure ?? "—"}</dd>
      <dt className="text-slate-500">内部審査補足（社内）</dt>
      <dd className="text-amber-800">{v.internalUnderwritingNotes ?? "—"}</dd>
      <dt className="text-slate-500">申込先 URL</dt>
      <dd className="break-all">{v.applicationUrl ?? "—"}</dd>
      <dt className="text-slate-500">有効期間</dt>
      <dd>
        {formatDate(v.validFrom)} 〜 {formatDate(v.validUntil)}
      </dd>
    </dl>
  );
}

export default async function PartnerLoanDetailPage({ params, searchParams }: PageProps) {
  const { role } = await requireOrgAccess();
  if (role !== "ORGANIZATION_ADMIN") redirect("/settings/partner-loans");

  const { partnerLoanId } = await params;
  if (!isUuid(partnerLoanId)) notFound();
  const detail = await orErrorPage(() => loadPartnerLoanDetail(partnerLoanId));
  if (!detail) notFound();

  const sp = await searchParams;
  const notice = NOTICE[noticeKeyOf(sp)];

  const current = detail.versions.find((v) => v.id === detail.currentVersionId);
  const past = detail.versions.filter((v) => v.id !== detail.currentVersionId);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{detail.displayName}</h1>
        <Link href="/settings/partner-loans" className="text-sm text-slate-600 hover:underline">
          一覧へ戻る
        </Link>
      </div>

      {notice ? (
        <div
          className={
            notice.kind === "ok"
              ? "rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800"
              : "rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800"
          }
          role={notice.kind === "error" ? "alert" : undefined}
        >
          {notice.text}
        </div>
      ) : null}

      <section className="rounded border border-slate-200 bg-white p-4 text-sm">
        <div className="mb-2 flex items-center justify-between">
          <span>
            {detail.institutionName} ・{" "}
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
              {partnerLoanStatusLabel(detail.status)}
            </span>
          </span>
          <span className="text-xs text-slate-500">
            最終確認: {formatDate(detail.lastConfirmedAt)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/settings/partner-loans/${detail.id}/edit`}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
          >
            編集（新バージョン作成）
          </Link>
          {detail.status !== "active" ? (
            <form action={activatePartnerLoan}>
              <input type="hidden" name="partnerLoanId" value={detail.id} />
              <button className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">
                診断対象として有効化
              </button>
            </form>
          ) : null}
          {detail.status !== "inactive" ? (
            <form action={deactivatePartnerLoan}>
              <input type="hidden" name="partnerLoanId" value={detail.id} />
              <button className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">
                無効化
              </button>
            </form>
          ) : null}
          <form action={confirmPartnerLoan}>
            <input type="hidden" name="partnerLoanId" value={detail.id} />
            <button className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">
              変更なしで確認済みにする
            </button>
          </form>
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">
          現在のバージョン{current ? `（v${current.versionNumber}）` : ""}
        </h2>
        {current ? <VersionView v={current} /> : <p className="text-sm text-slate-500">バージョン未作成</p>}
      </section>

      {past.length > 0 ? (
        <section className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">過去のバージョン</h2>
          <ul className="flex flex-col gap-3">
            {past.map((v) => (
              <li key={v.id} className="rounded border border-slate-100 bg-slate-50 p-3">
                <div className="mb-2 text-xs font-medium text-slate-600">
                  v{v.versionNumber}（作成: {formatDate(v.createdAt)}）
                </div>
                <VersionView v={v} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
