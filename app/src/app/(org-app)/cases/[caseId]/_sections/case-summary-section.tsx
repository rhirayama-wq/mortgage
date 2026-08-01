/**
 * 案件詳細: 概要セクション（案件レベルの情報 + 次アクション）。
 * 案件詳細画面はセクション単位で構成し、後続フェーズの機能（利用可能な提携ローン・診断結果・
 * 金融機関比較・申込履歴）を独立セクションとして追加できる構造を保つ
 * （設計意図は docs/phase2a-2-plan.md / docs/data-model.md）。
 */

import type { StaffCaseDetail } from "@/lib/customer-cases/queries";
import { customerCaseStatusLabel, formatYen } from "@/lib/customer-cases/labels";

export function CaseSummarySection({ detail }: { detail: StaffCaseDetail }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold">案件概要</h2>
      <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt className="text-slate-500">ステータス</dt>
        <dd>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
            {customerCaseStatusLabel(detail.status)}
          </span>
        </dd>
        <dt className="text-slate-500">担当営業</dt>
        <dd>{detail.assignedSalesName}</dd>
        <dt className="text-slate-500">希望物件価格</dt>
        <dd>{formatYen(detail.desiredPriceYen)}</dd>
      </dl>

      <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
        次に必要なアクション: {detail.nextAction}
      </div>
    </section>
  );
}
