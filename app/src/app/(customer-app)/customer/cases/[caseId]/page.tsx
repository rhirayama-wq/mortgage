/**
 * /customer/cases/[caseId] — 顧客本人の案件ビュー（自分の申込者・自分の情報のみ）。
 * 未参加/不存在は notFound、DB 障害は /error（require ヘルパーが担保）。
 * 2 ステップ导线: 基本情報 / 勤務・収入情報（それぞれ入力状況を表示）。
 */

import Link from "next/link";
import {
  requireCustomerCaseParticipant,
  requireCustomerCaseEmploymentIncome,
} from "@/lib/auth/require";
import {
  customerCaseStatusLabel,
  caseApplicantTypeLabel,
} from "@/lib/customer-cases/labels";
import { isBasicProfileStarted } from "@/lib/customer-cases/profile";
import {
  isEmploymentIncomeStarted,
  employmentIncomeProgressLabel,
} from "@/lib/customer-cases/employment-income";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ caseId: string }>;
}

export default async function CustomerCaseViewPage({ params }: PageProps) {
  const { caseId } = await params;
  const view = await requireCustomerCaseParticipant(caseId);
  const ei = await requireCustomerCaseEmploymentIncome(caseId);

  const basicStarted = isBasicProfileStarted(view.profile);
  const eiStarted = isEmploymentIncomeStarted(ei.employmentIncome);
  const eiLabel = employmentIncomeProgressLabel(eiStarted, ei.isComplete);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{view.caseName}</h1>
        <Link href="/customer/cases" className="text-sm text-slate-600 hover:underline">
          マイページ
        </Link>
      </div>

      <section className="rounded border border-slate-200 bg-white p-4 text-sm">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
          <dt className="text-slate-500">あなたの区分</dt>
          <dd>{caseApplicantTypeLabel(view.applicantType)}</dd>
          <dt className="text-slate-500">ステータス</dt>
          <dd>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
              {customerCaseStatusLabel(view.status)}
            </span>
          </dd>
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">入力する情報</h2>

        <div className="flex items-center justify-between rounded border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium">1. 基本情報</span>
            <span className="text-xs text-slate-500">
              {basicStarted ? "入力済み（続きの編集ができます）" : "未入力"}
            </span>
          </div>
          <Link
            href={`/customer/cases/${view.caseId}/profile`}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            基本情報を入力する
          </Link>
        </div>

        <div className="flex items-center justify-between rounded border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium">2. 勤務・収入情報</span>
            <span className="text-xs text-slate-500">{eiLabel}</span>
          </div>
          <Link
            href={`/customer/cases/${view.caseId}/employment-income`}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            勤務・収入情報を入力する
          </Link>
        </div>
      </section>
    </div>
  );
}
