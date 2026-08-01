/**
 * /cases — スタッフ（営業/法人管理者）向け案件一覧。
 * 認可は (org-app)/layout.tsx が実施済み。表示範囲は RLS が担う
 * （担当営業は自担当・法人管理者は自法人。他法人・他担当は不可視）。
 */

import Link from "next/link";
import { orErrorPage } from "@/lib/auth/require";
import { loadStaffCaseList } from "@/lib/customer-cases/queries";
import {
  customerCaseStatusLabel,
  caseInvitationStatusLabel,
  formatYen,
} from "@/lib/customer-cases/labels";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const cases = await orErrorPage(loadStaffCaseList);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">案件一覧</h1>
        <Link
          href="/cases/new"
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          案件を作成
        </Link>
      </div>

      {cases.length === 0 ? (
        <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">
          案件はまだありません。「案件を作成」から作成してください。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cases.map((c) => (
            <li key={c.id}>
              <Link
                href={`/cases/${c.id}`}
                className="block rounded border border-slate-200 bg-white p-4 hover:border-slate-400"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{c.caseName}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {customerCaseStatusLabel(c.status)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>主申込者: {c.primaryApplicantName ?? "未入力"}</span>
                  <span>担当: {c.assignedSalesName}</span>
                  <span>希望価格: {formatYen(c.desiredPriceYen)}</span>
                  <span>
                    招待:{" "}
                    {c.primaryInvitationStatus
                      ? caseInvitationStatusLabel(c.primaryInvitationStatus)
                      : "未招待"}
                  </span>
                  <span>
                    進捗:{" "}
                    {!c.primaryAccepted
                      ? "受諾待ち"
                      : c.basicInfoStarted
                        ? "入力中"
                        : "入力待ち"}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
