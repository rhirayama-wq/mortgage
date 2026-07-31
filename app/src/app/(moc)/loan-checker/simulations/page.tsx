"use client";

/** 改善シミュレーション（§11・差別化の主要画面）。現在条件 vs 変更後を比較表示。 */

import { AgentShell } from "@/components/loan-checker-moc/agent-shell";
import { Card, Note } from "@/components/loan-checker-moc/ui";
import { SIMULATIONS } from "@/lib/loan-checker-moc/fixtures";

export default function SimulationsPage() {
  return (
    <AgentShell title="改善シミュレーション">
      <Note tone="warn">
        条件を変えると結果がどう変わるかを示します（デモ・架空・参考値）。
      </Note>

      <div className="mt-4 space-y-4">
        {SIMULATIONS.map((sim) => (
          <Card key={sim.id}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">{sim.title}</h2>
              {sim.isCustomerEstimate ? (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  顧客自由試算
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-slate-600">{sim.description}</p>

            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">項目</th>
                    <th className="px-3 py-2 font-medium">現在の条件</th>
                    <th className="px-3 py-2 font-medium">変更後</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sim.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-600">{r.label}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-500">
                        {r.before}
                      </td>
                      <td className="px-3 py-2 tabular-nums font-semibold text-slate-900">
                        <span className="inline-flex items-center gap-1">
                          <span
                            aria-hidden="true"
                            className={r.improved ? "text-emerald-600" : "text-slate-400"}
                          >
                            {r.improved ? "▲" : "＝"}
                          </span>
                          {r.after}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-xs text-slate-500">{sim.note}</p>
          </Card>
        ))}
      </div>

      <div className="mt-4">
        <Note tone="neutral">
          シミュレーション結果は参考値です。正式な条件・可否は各金融機関の審査で確定します。
        </Note>
      </div>
    </AgentShell>
  );
}
