"use client";

/** MFS管理者ビュー（§7C・最小限）。デモ案件一覧・診断状態・金融機関マスター・ルールver・監査イベント。 */

import {
  Card,
  StatusBadge,
  Note,
  InfoRow,
  VerdictBadge,
} from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";
import { formatPercentFromBps } from "@/lib/loan-checker-moc/format";
import { YAMADA_ASSESSMENT } from "@/lib/loan-checker-moc/fixtures";

const RULE_VERSION = "demo-rules-2026.07 (mock)";

const AUDIT_EVENTS = [
  { at: "07/31 09:12", event: "assessment.started", actor: "system", target: "seed-tanaka" },
  { at: "07/31 08:30", event: "consent.granted", actor: "customer", target: "seed-tanaka" },
  { at: "07/28 13:05", event: "consultation.requested", actor: "customer", target: "seed-watanabe" },
  { at: "07/25 09:55", event: "assessment.completed", actor: "system", target: "seed-yamada" },
  { at: "07/25 09:05", event: "identity.verified", actor: "customer", target: "seed-yamada" },
];

export default function AdminPage() {
  const { cases } = useDemo();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-lg font-semibold text-slate-900">MFS管理者ビュー</h1>
      <p className="mt-1 text-sm text-slate-600">
        MoCの運用状態を俯瞰する最小限のビューです（すべて架空データ）。
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">
            デモ案件・診断状態
          </h2>
          <ul className="divide-y divide-slate-100">
            {cases.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  <span className="font-mono text-xs text-slate-400">{c.id}</span>
                  <span className="ml-2 text-slate-700">{c.customerName}</span>
                </span>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">
            ルールバージョン
          </h2>
          <dl>
            <InfoRow label="診断ルール" value={RULE_VERSION} />
            <InfoRow label="判定モデル" value="決定的・参考値（mock）" />
            <InfoRow label="接続状態" value="信用情報／eKYC／金融機関: 未接続" />
          </dl>
          <div className="mt-3">
            <Note tone="neutral">
              本番の審査ロジック・ルールエンジンとは無関係のデモ表示です。
            </Note>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">
            金融機関マスター（モック）
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">金融機関</th>
                  <th className="py-2 pr-4 font-medium">商品</th>
                  <th className="py-2 pr-4 font-medium">想定金利</th>
                  <th className="py-2 font-medium">既定判定</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {YAMADA_ASSESSMENT.lenders.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-4 text-slate-800">{l.lenderName}</td>
                    <td className="py-2 pr-4 text-slate-600">{l.productName}</td>
                    <td className="py-2 pr-4 tabular-nums text-slate-800">
                      {formatPercentFromBps(l.assumedRateBps)}
                    </td>
                    <td className="py-2">
                      <VerdictBadge verdict={l.verdict} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">
            監査イベント（モック）
          </h2>
          <ul className="space-y-1.5">
            {AUDIT_EVENTS.map((e, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="w-16 shrink-0 tabular-nums text-slate-400">
                  {e.at}
                </span>
                <span className="font-mono text-xs text-sky-700">{e.event}</span>
                <span className="text-slate-500">
                  {e.actor} → {e.target}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <Note tone="neutral">
              監査イベントは表示用のモックです。本番の監査基盤とは接続していません。
            </Note>
          </div>
        </Card>
      </div>
    </div>
  );
}
