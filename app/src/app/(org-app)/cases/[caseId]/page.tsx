/**
 * /cases/[caseId] — スタッフ向け案件詳細。
 * 認可は (org-app)/layout.tsx + RLS。未認可/不存在は notFound（他案件の存在を漏らさない）。
 *
 * 画面はセクション単位のコンポーネントで構成する。後続フェーズ（例: 提携ローン）は
 * 独立セクションとして追加できる構造を保つ。設計意図は docs/phase2a-2-plan.md 参照。
 * 本フェーズでは未実装機能のプレースホルダ・空カード・CTA は表示しない。
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { orErrorPage } from "@/lib/auth/require";
import { loadStaffCaseDetail } from "@/lib/customer-cases/queries";
import { isUuid } from "@/lib/auth/validators";
import { CaseSummarySection } from "./_sections/case-summary-section";
import { ApplicantsSection } from "./_sections/applicants-section";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function noticeKeyOf(sp: Record<string, string | string[] | undefined>): string {
  if (sp.invited === "1") return "invited=1";
  if (typeof sp.e === "string") return `e=${sp.e}`;
  return "";
}

export default async function CaseDetailPage({ params, searchParams }: PageProps) {
  const { caseId } = await params;
  if (!isUuid(caseId)) notFound();

  const sp = await searchParams;
  const detail = await orErrorPage(() => loadStaffCaseDetail(caseId));
  if (!detail) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{detail.caseName}</h1>
        <Link href="/cases" className="text-sm text-slate-600 hover:underline">
          一覧へ戻る
        </Link>
      </div>

      <CaseSummarySection detail={detail} />
      <ApplicantsSection detail={detail} noticeKey={noticeKeyOf(sp)} />
    </div>
  );
}
