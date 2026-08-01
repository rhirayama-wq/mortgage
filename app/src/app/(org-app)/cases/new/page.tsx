/**
 * /cases/new — 案件作成 + 主申込者招待フォーム。認可は (org-app)/layout.tsx が実施済み。
 * organizationId / role はサーバーで導出。担当営業は ADMIN のみ選択可（SALES は自分のみ表示）。
 */

import Link from "next/link";
import { requireOrgAccess, orErrorPage } from "@/lib/auth/require";
import { loadOrgActiveMembers } from "@/lib/customer-cases/queries";
import { createCase } from "./actions";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ERROR_MESSAGES: Record<string, string> = {
  name: "案件名は 1〜200 文字で入力してください。",
  email: "顧客メールアドレスの形式が正しくありません。",
  price: "希望物件価格は 0 以上の整数（円）で入力してください。",
  create: "案件を作成できませんでした。時間をおいて再度お試しください。",
};

export default async function NewCasePage({ searchParams }: PageProps) {
  const { organizationId, membershipId, role } = await requireOrgAccess();
  const members = await orErrorPage(() => loadOrgActiveMembers(organizationId));
  const isAdmin = role === "ORGANIZATION_ADMIN";

  const params = await searchParams;
  const errKey = typeof params.e === "string" ? params.e : "";
  const errorMessage = ERROR_MESSAGES[errKey];

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">新規案件</h1>
        <Link href="/cases" className="text-sm text-slate-600 hover:underline">
          一覧へ戻る
        </Link>
      </div>

      {errorMessage ? (
        <div
          className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      <form action={createCase} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">案件名</span>
          <input
            type="text"
            name="caseName"
            required
            maxLength={200}
            placeholder="例: 架空 太郎 様 住宅ローン案件"
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">顧客メールアドレス</span>
          <input
            type="email"
            name="customerEmail"
            required
            placeholder="customer@example.test"
            className="rounded border border-slate-300 px-3 py-2"
          />
          <span className="text-xs text-slate-500">
            この宛先に Magic Link 招待を作成します。顧客の氏名等は招待後の基本情報入力で扱います。
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">希望物件価格（円・任意）</span>
          <input
            type="text"
            name="desiredPriceYen"
            inputMode="numeric"
            placeholder="例: 80000000"
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">担当営業</span>
          {isAdmin ? (
            <select
              name="assignedMembershipId"
              defaultValue={membershipId}
              className="rounded border border-slate-300 px-3 py-2"
            >
              {members.map((m) => (
                <option key={m.membershipId} value={m.membershipId}>
                  {m.displayName}
                  {m.role === "ORGANIZATION_ADMIN" ? "（管理者）" : ""}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input type="hidden" name="assignedMembershipId" value={membershipId} />
              <span className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
                {members.find((m) => m.membershipId === membershipId)?.displayName ??
                  "自分"}
              </span>
            </>
          )}
        </label>

        <div>
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            案件を作成して招待
          </button>
        </div>
      </form>
    </div>
  );
}
