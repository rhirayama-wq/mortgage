/**
 * /customer/cases/[caseId]/profile — 顧客本人の基本情報入力（オートセーブ）。
 * 認可・本人性は requireCustomerCaseParticipant + RLS + RPC が担保する。
 * 編集可否は案件ステータス（opened / inputting）で判定する。
 */

import Link from "next/link";
import { requireCustomerCaseParticipant } from "@/lib/auth/require";
import { BasicProfileForm } from "./basic-profile-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ caseId: string }>;
}

export default async function CustomerProfilePage({ params }: PageProps) {
  const { caseId } = await params;
  const view = await requireCustomerCaseParticipant(caseId);
  const editable = view.status === "opened" || view.status === "inputting";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">基本情報の入力</h1>
        <Link
          href={`/customer/cases/${view.caseId}`}
          className="text-sm text-slate-600 hover:underline"
        >
          案件へ戻る
        </Link>
      </div>

      <p className="text-sm text-slate-600">
        入力内容は自動的に保存されます。すべて一度に入力する必要はありません。
      </p>

      <BasicProfileForm
        applicantId={view.applicantId}
        initial={view.profile}
        editable={editable}
      />
    </div>
  );
}
