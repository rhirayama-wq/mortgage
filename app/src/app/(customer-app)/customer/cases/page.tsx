/**
 * /customer/cases — 顧客ポータル。参加中の案件と、自分宛の保留中招待を表示する。
 * 表示範囲は RLS が担保する（自分が participant の案件・自分宛 invited の招待のみ）。
 */

import Link from "next/link";
import { orErrorPage } from "@/lib/auth/require";
import { loadCustomerPortal } from "@/lib/customer-cases/queries";
import { customerCaseStatusLabel } from "@/lib/customer-cases/labels";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CustomerCasesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const accepted = params.accepted === "1";
  const portal = await orErrorPage(loadCustomerPortal);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-lg font-semibold">マイページ</h1>

      {accepted ? (
        <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          招待を受諾しました。案件が下に表示されています。
        </div>
      ) : null}

      {portal.invitations.length > 0 ? (
        <section className="rounded border border-amber-300 bg-amber-50 p-4">
          <h2 className="mb-2 text-sm font-semibold">新しい案件への招待</h2>
          <ul className="flex flex-col gap-2">
            {portal.invitations.map((inv) => (
              <li
                key={inv.invitationId}
                className="flex items-center justify-between rounded border border-amber-200 bg-white p-3 text-sm"
              >
                <span>案件への参加を招待されています。</span>
                <Link
                  href={`/customer/invitations/${inv.invitationId}`}
                  className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                >
                  内容を確認
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold">参加中の案件</h2>
        {portal.cases.length === 0 ? (
          <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">
            参加中の案件はまだありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {portal.cases.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/customer/cases/${c.id}`}
                  className="block rounded border border-slate-200 bg-white p-4 hover:border-slate-400"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{c.caseName}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {customerCaseStatusLabel(c.status)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {c.organizationName ? <span>{c.organizationName}</span> : null}
                    <span>担当: {c.assignedSalesName}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
