/**
 * /customer/cases/[caseId]/employment-income — 顧客本人の勤務・収入情報入力（オートセーブ）。
 * 認可・本人性は requireCustomerCaseEmploymentIncome + RLS + RPC が担保する。
 * 編集可否は案件ステータス（opened / inputting）で判定する。
 * 完了判定は DB 純粋関数が唯一の正（初期表示は RPC 由来の is_complete / missing_fields）。
 */

import Link from "next/link";
import { requireCustomerCaseEmploymentIncome } from "@/lib/auth/require";
import { EmploymentIncomeForm } from "./employment-income-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ caseId: string }>;
}

export default async function CustomerEmploymentIncomePage({ params }: PageProps) {
  const { caseId } = await params;
  const view = await requireCustomerCaseEmploymentIncome(caseId);
  const editable = view.status === "opened" || view.status === "inputting";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">勤務・収入情報の入力</h1>
        <Link
          href={`/customer/cases/${view.caseId}`}
          className="text-sm text-slate-600 hover:underline"
        >
          案件へ戻る
        </Link>
      </div>

      <p className="text-sm text-slate-600">
        入力内容は自動的に保存されます。すべて一度に入力する必要はありません。
        雇用形態によって必要な項目が変わります。
      </p>

      <EmploymentIncomeForm
        applicantId={view.applicantId}
        initial={view.employmentIncome}
        editable={editable}
        initialIsComplete={view.isComplete}
        initialMissingFields={view.missingFields}
      />
    </div>
  );
}
