/** 金融機関・商品カード（営業向け結果／比較画面で共用）。 */

import type { DemoLenderAssessment } from "@/lib/loan-checker-moc/types";
import { formatPercentFromBps, yenRangeMan } from "@/lib/loan-checker-moc/format";
import { VerdictBadge, Bullets } from "./ui";

export function LenderCard({
  lender,
  rank,
}: {
  lender: DemoLenderAssessment;
  rank?: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {rank ? (
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
                {rank}
              </span>
            ) : null}
            <h3 className="truncate text-sm font-semibold text-slate-900">
              {lender.lenderName}
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{lender.productName}</p>
        </div>
        <VerdictBadge verdict={lender.verdict} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <div className="text-[11px] text-slate-500">借入見込み</div>
          <div className="text-sm font-bold tabular-nums text-slate-900">
            {yenRangeMan(lender.estimatedLoanLowYen, lender.estimatedLoanHighYen)}
          </div>
        </div>
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <div className="text-[11px] text-slate-500">想定金利</div>
          <div className="text-sm font-bold tabular-nums text-slate-900">
            {formatPercentFromBps(lender.assumedRateBps)}
          </div>
        </div>
      </div>

      {lender.reasons.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-slate-600">理由</div>
          <Bullets items={lender.reasons} />
        </div>
      ) : null}
      {lender.cautions.length > 0 ? (
        <div className="mt-2">
          <div className="mb-1 text-xs font-semibold text-amber-700">注意</div>
          <Bullets items={lender.cautions} />
        </div>
      ) : null}
    </div>
  );
}
