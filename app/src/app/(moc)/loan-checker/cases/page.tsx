"use client";

/** 顧客案件一覧（§9.2）。PCは表、モバイルはカード。 */

import Link from "next/link";
import { AgentShell } from "@/components/loan-checker-moc/agent-shell";
import { StatusBadge, PrimaryLink } from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";
import { yenToManYen } from "@/lib/loan-checker-moc/format";

export default function CasesPage() {
  const { cases } = useDemo();

  return (
    <AgentShell
      title="顧客案件一覧"
      actions={<PrimaryLink href="/loan-checker/cases/new">新しい顧客を招待</PrimaryLink>}
    >
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">顧客名 / 案件名</th>
              <th className="px-4 py-2 font-medium">希望物件価格</th>
              <th className="px-4 py-2 font-medium">担当営業</th>
              <th className="px-4 py-2 font-medium">ステータス</th>
              <th className="px-4 py-2 font-medium">最終更新</th>
              <th className="px-4 py-2 font-medium">次回アクション</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cases.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/loan-checker/cases/${c.id}`}
                    className="font-medium text-sky-700 hover:underline"
                  >
                    {c.customerName}
                  </Link>
                  <div className="text-xs text-slate-500">{c.caseName}</div>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {yenToManYen(c.desiredPriceYen)}
                </td>
                <td className="px-4 py-3 text-slate-600">{c.agentName}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-4 py-3 text-slate-500">{c.lastUpdated}</td>
                <td className="px-4 py-3 text-slate-600">{c.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {cases.map((c) => (
          <li key={c.id}>
            <Link
              href={`/loan-checker/cases/${c.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">
                  {c.customerName}
                </span>
                <StatusBadge status={c.status} />
              </div>
              <div className="mt-1 text-xs text-slate-500">{c.caseName}</div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                <span>{yenToManYen(c.desiredPriceYen)}</span>
                <span>{c.lastUpdated}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">次: {c.nextAction}</div>
            </Link>
          </li>
        ))}
      </ul>
    </AgentShell>
  );
}
