"use client";

/** 顧客向け診断結果（§9.16）。分かりやすさ優先。金融機関タイプ別見込み・注意点・準備・改善・相談導線。 */

import { CustomerShell } from "@/components/loan-checker-moc/customer-shell";
import {
  Card,
  StatTile,
  Note,
  Bullets,
  VerdictBadge,
  SecondaryLink,
} from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";
import { yenRangeMan, formatPercentFromBps } from "@/lib/loan-checker-moc/format";
import { useRouter } from "next/navigation";

export default function CustomerResultPage() {
  const { customerCase } = useDemo();
  const router = useRouter();
  const a = customerCase?.assessment;

  if (!customerCase || !a) {
    return (
      <CustomerShell stepKey="result" title="診断結果">
        <Note tone="neutral" title="まだ結果がありません">
          診断が完了すると結果が表示されます。
        </Note>
        <SecondaryLink href="/loan-checker/customer/processing">診断へ戻る</SecondaryLink>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell
      stepKey="result"
      title="診断結果"
      subtitle="無理のない購入予算と、通りやすい住宅ローンの目安です（参考値）。"
      backHref="/loan-checker/customer"
      footer={
        <button
          type="button"
          onClick={() => router.push("/loan-checker/consultation")}
          className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
        >
          モゲチェックに相談する
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="購入できる価格帯の目安"
          value={yenRangeMan(a.affordablePriceLowYen, a.affordablePriceHighYen)}
          emphasize
        />
        <StatTile
          label="月々の返済目安"
          value={yenRangeMan(a.monthlyHousingLowYen, a.monthlyHousingHighYen)}
          emphasize
        />
        <StatTile
          label="無理のない借入額"
          value={yenRangeMan(a.recommendedLoanLowYen, a.recommendedLoanHighYen)}
        />
        <StatTile
          label="通る見込みの借入額"
          value={yenRangeMan(a.approvableLoanLowYen, a.approvableLoanHighYen)}
        />
      </div>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">
          金融機関タイプ別の見込み
        </h2>
        <ul className="space-y-2">
          {a.lenders.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">
                  {l.lenderName}
                </div>
                <div className="text-xs text-slate-500">
                  {yenRangeMan(l.estimatedLoanLowYen, l.estimatedLoanHighYen)}・想定{" "}
                  {formatPercentFromBps(l.assumedRateBps)}
                </div>
              </div>
              <VerdictBadge verdict={l.verdict} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          詳しい比較や申込の進め方は、担当者・モゲチェックがご説明します。
        </p>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-slate-900">主な注意点</h2>
        <Bullets items={a.keyCautions} />
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-slate-900">今後の準備</h2>
        <Bullets items={a.additionalChecks} />
      </Card>

      <Note tone="info" title="改善できる可能性">
        <p>{a.improvementNote}</p>
        <div className="mt-2">
          <SecondaryLink href="/loan-checker/simulations">
            改善シミュレーションを見る
          </SecondaryLink>
        </div>
      </Note>

      <Note tone="neutral" title="この結果について">
        <p>
          これは正式な事前審査ではなく、参考値です。正式な事前審査へ進む場合も、
          モゲチェックがサポートします。
        </p>
        <div className="mt-2">
          <SecondaryLink href="/loan-checker/consultation">
            事前審査の進め方を確認する
          </SecondaryLink>
        </div>
      </Note>
    </CustomerShell>
  );
}
