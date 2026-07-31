"use client";

/** 金融機関・商品比較（§15・差別化の主要画面）。比較表＋詳細カード＋申込戦略。 */

import { AgentShell } from "@/components/loan-checker-moc/agent-shell";
import { Card, VerdictBadge, Note, Bullets } from "@/components/loan-checker-moc/ui";
import { LenderCard } from "@/components/loan-checker-moc/lender-card";
import { YAMADA_ASSESSMENT } from "@/lib/loan-checker-moc/fixtures";
import { formatPercentFromBps, yenRangeMan } from "@/lib/loan-checker-moc/format";
import type { LenderVerdict } from "@/lib/loan-checker-moc/types";

const RANK: Record<LenderVerdict, number> = {
  RECOMMENDED: 0,
  LIKELY: 1,
  POSSIBLE: 2,
  DIFFICULT: 3,
};

export default function LendersPage() {
  const a = YAMADA_ASSESSMENT;
  const lenders = [...a.lenders].sort(
    (x, y) => RANK[x.verdict] - RANK[y.verdict],
  );

  return (
    <AgentShell title="金融機関・商品比較">
      <Note tone="warn">
        銀行タイプ別ではなく、金融機関・商品単位で見込みを提示します（デモ・架空・参考値）。
      </Note>

      <div className="mt-4 hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">金融機関 / 商品</th>
              <th className="px-4 py-2 font-medium">判定</th>
              <th className="px-4 py-2 font-medium">借入見込み</th>
              <th className="px-4 py-2 font-medium">想定金利</th>
              <th className="px-4 py-2 font-medium">主な注意</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lenders.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{l.lenderName}</div>
                  <div className="text-xs text-slate-500">{l.productName}</div>
                </td>
                <td className="px-4 py-3">
                  <VerdictBadge verdict={l.verdict} />
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {yenRangeMan(l.estimatedLoanLowYen, l.estimatedLoanHighYen)}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {formatPercentFromBps(l.assumedRateBps)}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {l.cautions[0] ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {lenders.map((l, i) => (
          <LenderCard key={l.id} lender={l} rank={i + 1} />
        ))}
      </div>

      <div className="mt-5">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">
            申込戦略（推奨順序）
          </h2>
          <dl className="mb-3 space-y-1 text-sm">
            <div className="flex gap-2">
              <span className="w-16 shrink-0 text-slate-500">第1候補</span>
              <span className="font-medium text-slate-900">{a.strategy.firstChoice}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-16 shrink-0 text-slate-500">第2候補</span>
              <span className="font-medium text-slate-900">{a.strategy.secondChoice}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-16 shrink-0 text-slate-500">バックアップ</span>
              <span className="font-medium text-slate-900">{a.strategy.backup}</span>
            </div>
          </dl>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            {a.strategy.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <div className="mt-3">
            <Note tone="warn">
              <Bullets items={a.strategy.cautions} />
            </Note>
          </div>
        </Card>
      </div>
    </AgentShell>
  );
}
