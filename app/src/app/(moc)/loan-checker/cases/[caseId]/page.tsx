"use client";

/** 案件詳細（§9.4）。概要・顧客進捗・診断状況・希望物件・タイムライン・次回アクション。 */

import { useParams } from "next/navigation";
import { AgentShell } from "@/components/loan-checker-moc/agent-shell";
import {
  Card,
  InfoRow,
  StatusBadge,
  PrimaryLink,
  SecondaryLink,
  Note,
} from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";
import { yenToManYen } from "@/lib/loan-checker-moc/format";
import type { DemoCustomerFlow } from "@/lib/loan-checker-moc/types";

const FLOW_LABELS: Array<{ key: keyof DemoCustomerFlow; label: string }> = [
  { key: "identityDone", label: "本人確認" },
  { key: "profileDone", label: "基本情報" },
  { key: "employmentDone", label: "勤務・収入" },
  { key: "householdDone", label: "世帯・共同申込" },
  { key: "propertyDone", label: "購入希望" },
  { key: "supplementDone", label: "補足情報" },
  { key: "consentDone", label: "同意" },
  { key: "processingDone", label: "診断" },
];

export default function CaseDetailPage() {
  const params = useParams<{ caseId: string }>();
  const { getCase } = useDemo();
  const c = getCase(params.caseId);

  if (!c) {
    return (
      <AgentShell title="案件詳細">
        <Card>
          <p className="text-sm text-slate-600">
            案件が見つかりません。デモを初期化したか、無効なリンクの可能性があります。
          </p>
          <div className="mt-3">
            <SecondaryLink href="/loan-checker/cases">案件一覧へ戻る</SecondaryLink>
          </div>
        </Card>
      </AgentShell>
    );
  }

  return (
    <AgentShell
      title={c.customerName}
      actions={<StatusBadge status={c.status} />}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">案件概要</h2>
          <dl>
            <InfoRow label="案件名" value={c.caseName} />
            <InfoRow label="担当営業" value={c.agentName} />
            <InfoRow label="希望物件価格" value={yenToManYen(c.desiredPriceYen)} />
            <InfoRow label="希望物件" value={c.desiredPropertyName || "（未入力）"} />
            <InfoRow label="最終更新" value={c.lastUpdated} />
          </dl>
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">顧客進捗</h2>
          <ul className="grid grid-cols-2 gap-1.5">
            {FLOW_LABELS.map((f) => {
              const done = c.flow[f.key];
              return (
                <li
                  key={f.key}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <span
                    aria-hidden="true"
                    className={
                      done ? "text-emerald-600" : "text-slate-300"
                    }
                  >
                    {done ? "●" : "○"}
                  </span>
                  <span className={done ? "" : "text-slate-400"}>{f.label}</span>
                  <span className="sr-only">{done ? "完了" : "未完了"}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">診断状況</h2>
          {c.assessment ? (
            <div>
              <Note tone="success" title="診断完了">
                承認見込み借入額や購入可能価格帯、金融機関候補が確定しました（参考値）。
              </Note>
              <div className="mt-3">
                <PrimaryLink href={`/loan-checker/cases/${c.id}/result`}>
                  営業向け診断結果を見る
                </PrimaryLink>
              </div>
            </div>
          ) : (
            <Note tone="neutral">
              まだ診断は完了していません。次回アクション: {c.nextAction}
            </Note>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">タイムライン</h2>
          {c.timeline.length === 0 ? (
            <p className="text-sm text-slate-500">まだ履歴はありません。</p>
          ) : (
            <ol className="space-y-2">
              {c.timeline.map((e, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-16 shrink-0 tabular-nums text-slate-400">
                    {e.at}
                  </span>
                  <span className="text-slate-700">
                    <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                      {e.actor}
                    </span>
                    {e.label}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </AgentShell>
  );
}
