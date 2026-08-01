/**
 * /settings/partner-loans/new — 提携ローン新規登録（ORGANIZATION_ADMIN のみ）。
 * SALES_USER が来た場合は一覧へ戻す（編集不可）。送信は Server Action createPartnerLoan。
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { requireOrgAccess } from "@/lib/auth/require";
import { PartnerLoanForm } from "../partner-loan-form";
import { createPartnerLoan } from "../actions";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewPartnerLoanPage({ searchParams }: PageProps) {
  const { role } = await requireOrgAccess();
  if (role !== "ORGANIZATION_ADMIN") redirect("/settings/partner-loans");

  const params = await searchParams;
  const errKey = typeof params.e === "string" ? params.e : "";
  const errorMessage =
    errKey === "validation"
      ? "入力内容をご確認ください（金利・金額・期間・URL などの形式）。"
      : errKey === "save"
        ? "登録できませんでした。時間をおいて再度お試しください。"
        : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">提携ローンを登録</h1>
        <Link
          href="/settings/partner-loans"
          className="text-sm text-slate-600 hover:underline"
        >
          一覧へ戻る
        </Link>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        登録した商品はモゲチェック診断の対象になります。承認確率はモゲチェックが算出し、正式な審査結果は金融機関が判断します。登録後も編集できます。
      </p>
      <PartnerLoanForm
        action={createPartnerLoan}
        submitLabel="提携ローンを登録"
        mode="create"
        errorMessage={errorMessage}
      />
    </div>
  );
}
