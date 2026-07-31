"use client";

/** 営業ダッシュボード（§9.1）。担当案件・進捗・要対応・最近の案件・今月KPI（デモ値）。 */

import { useMemo } from "react";
import Link from "next/link";
import { AgentShell } from "@/components/loan-checker-moc/agent-shell";
import {
  Card,
  StatTile,
  StatusBadge,
  PrimaryLink,
  Note,
} from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";
import { DEMO_KPI } from "@/lib/loan-checker-moc/fixtures";
import { yenToManYen } from "@/lib/loan-checker-moc/format";
import type { CaseStatus } from "@/lib/loan-checker-moc/types";

const ACTION_STATUSES: CaseStatus[] = [
  "additional",
  "consent_pending",
  "expired",
];

export default function DashboardPage() {
  const { cases } = useDemo();

  const counts = useMemo(() => {
    const by = (fn: (s: CaseStatus) => boolean) =>
      cases.filter((c) => fn(c.status)).length;
    return {
      total: cases.length,
      invited: by((s) => s === "invited" || s === "opened"),
      inputting: by(
        (s) => s === "identity" || s === "inputting" || s === "consent_pending",
      ),
      assessing: by((s) => s === "assessing"),
      assessed: by((s) => s === "assessed"),
      consulted: by((s) => s === "consulted"),
    };
  }, [cases]);

  const needsAction = cases.filter((c) => ACTION_STATUSES.includes(c.status));
  const recent = cases.slice(0, 5);

  return (
    <AgentShell
      title="ダッシュボード"
      actions={<PrimaryLink href="/loan-checker/cases/new">新しい顧客を招待</PrimaryLink>}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <StatTile label="担当案件" value={counts.total} />
        <StatTile label="招待送信" value={counts.invited} />
        <StatTile label="入力中" value={counts.inputting} />
        <StatTile label="診断中" value={counts.assessing} />
        <StatTile label="診断完了" value={counts.assessed} />
        <StatTile label="相談移行" value={counts.consulted} />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              今週の要対応案件
            </h2>
            <span className="text-xs text-slate-500">{needsAction.length}件</span>
          </div>
          {needsAction.length === 0 ? (
            <p className="text-sm text-slate-500">対応が必要な案件はありません。</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {needsAction.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/loan-checker/cases/${c.id}`}
                    className="flex items-center justify-between gap-3 py-2 hover:opacity-80"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {c.customerName}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {c.nextAction}
                      </span>
                    </span>
                    <StatusBadge status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">最近の案件</h2>
          <ul className="divide-y divide-slate-100">
            {recent.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/loan-checker/cases/${c.id}`}
                  className="flex items-center justify-between gap-3 py-2 hover:opacity-80"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {c.customerName}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {yenToManYen(c.desiredPriceYen)}・{c.lastUpdated}
                    </span>
                  </span>
                  <StatusBadge status={c.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-5">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">
          今月の実績（デモ値）
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <StatTile label="顧客招待" value={`${DEMO_KPI.invited}件`} />
          <StatTile label="入力開始" value={`${DEMO_KPI.started}件`} />
          <StatTile label="診断完了" value={`${DEMO_KPI.assessed}件`} />
          <StatTile label="相談移行" value={`${DEMO_KPI.consulted}件`} />
          <StatTile label="事前審査申込" value={`${DEMO_KPI.preScreening}件`} />
          <StatTile label="診断完了率" value={`${DEMO_KPI.completionRatePct}%`} />
          <StatTile label="相談移行率" value={`${DEMO_KPI.consultationRatePct}%`} />
        </div>
        <div className="mt-3">
          <Note tone="neutral">
            上記の月次KPIはデモ用の固定値です。実データではありません。
          </Note>
        </div>
      </div>
    </AgentShell>
  );
}
