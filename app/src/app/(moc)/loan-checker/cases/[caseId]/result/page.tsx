"use client";

/**
 * 営業担当者向け診断結果（§9.5・最重要画面）。
 * 明示: 信用情報の原票は表示しない／正式な事前審査ではない／最終判断は各金融機関。
 */

import { useParams } from "next/navigation";
import { AgentShell } from "@/components/loan-checker-moc/agent-shell";
import {
  Card,
  StatTile,
  ConfidenceBadge,
  Note,
  Bullets,
  PrimaryLink,
  SecondaryLink,
} from "@/components/loan-checker-moc/ui";
import { LenderCard } from "@/components/loan-checker-moc/lender-card";
import { useDemo } from "@/lib/loan-checker-moc/store";
import { yenRangeMan, yenToManYen } from "@/lib/loan-checker-moc/format";

export default function AgentResultPage() {
  const params = useParams<{ caseId: string }>();
  const { getCase } = useDemo();
  const c = getCase(params.caseId);

  if (!c) {
    return (
      <AgentShell title="営業向け診断結果">
        <Card>
          <p className="text-sm text-slate-600">案件が見つかりません。</p>
          <div className="mt-3">
            <SecondaryLink href="/loan-checker/cases">案件一覧へ</SecondaryLink>
          </div>
        </Card>
      </AgentShell>
    );
  }

  const a = c.assessment;
  if (!a) {
    return (
      <AgentShell title="営業向け診断結果">
        <Card>
          <Note tone="neutral" title="診断はまだ完了していません">
            顧客の入力・同意が完了すると診断結果が表示されます。
          </Note>
          <div className="mt-3">
            <SecondaryLink href={`/loan-checker/cases/${c.id}`}>
              案件詳細へ戻る
            </SecondaryLink>
          </div>
        </Card>
      </AgentShell>
    );
  }

  return (
    <AgentShell
      title={`${c.customerName} の診断結果`}
      actions={
        <div className="flex items-center gap-2">
          <ConfidenceBadge confidence={a.confidence} />
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
            有効期限: 診断日から{a.validityDays}日
          </span>
        </div>
      }
    >
      <Note tone="warn" title="この結果の位置づけ">
        <Bullets
          items={[
            "信用情報の原票は表示しません（共有されるのは見込み額・価格帯・候補・注意点などの要約です）",
            "これは正式な事前審査ではありません。デモ用の参考値です",
            "最終的な承認可否・条件は各金融機関の審査により確定します",
          ]}
        />
      </Note>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile
          label="推奨物件価格帯"
          value={yenRangeMan(a.recommendedPriceLowYen, a.recommendedPriceHighYen)}
          emphasize
        />
        <StatTile
          label="購入可能上限の目安"
          value={yenToManYen(a.affordablePriceHighYen)}
          sub={`購入可能価格帯 ${yenRangeMan(a.affordablePriceLowYen, a.affordablePriceHighYen)}`}
          emphasize
        />
        <StatTile
          label="月額住居費の目安"
          value={yenRangeMan(a.monthlyHousingLowYen, a.monthlyHousingHighYen)}
          emphasize
        />
        <StatTile
          label="承認見込み借入額"
          value={yenRangeMan(a.approvableLoanLowYen, a.approvableLoanHighYen)}
        />
        <StatTile
          label="推奨借入額"
          value={yenRangeMan(a.recommendedLoanLowYen, a.recommendedLoanHighYen)}
        />
        <StatTile
          label="理論借入上限（参考）"
          value={yenToManYen(a.theoreticalMaxLoanYen)}
          sub="実際に通りやすい額とは異なります"
        />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            金融機関・商品候補
          </h2>
          <SecondaryLink href="/loan-checker/lenders">比較表で見る</SecondaryLink>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {a.lenders.map((l, i) => (
            <LenderCard key={l.id} lender={l} rank={i + 1} />
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">申込戦略</h2>
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
          <div className="mb-1 text-xs font-semibold text-slate-600">推奨順序</div>
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

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">
            注意点・追加確認
          </h2>
          <div className="mb-1 text-xs font-semibold text-slate-600">主な注意点</div>
          <Bullets items={a.keyCautions} />
          <div className="mt-3 mb-1 text-xs font-semibold text-slate-600">
            追加確認事項
          </div>
          <Bullets items={a.additionalChecks} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">改善可能性</h2>
          <p className="text-sm text-slate-700">{a.improvementNote}</p>
          <div className="mt-3">
            <SecondaryLink href="/loan-checker/simulations">
              改善シミュレーションを見る
            </SecondaryLink>
          </div>
        </Card>
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">推奨アクション</h2>
          <Bullets items={a.recommendedActions} />
        </Card>
      </div>

      <div className="mt-4">
        <Note tone="info" title="顧客へ説明する際のコメント">
          <Bullets items={a.agentTalkingPoints} />
        </Note>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <PrimaryLink href="/loan-checker/consultation">
          モゲチェックに相談する
        </PrimaryLink>
        <SecondaryLink href={`/loan-checker/cases/${c.id}`}>
          案件詳細へ戻る
        </SecondaryLink>
      </div>
    </AgentShell>
  );
}
