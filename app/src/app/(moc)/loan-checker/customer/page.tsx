"use client";

/** サービス説明（§9.6）。目的・正式審査でない旨・信用情報利用・共有/非共有情報・所要時間。 */

import { CustomerShell } from "@/components/loan-checker-moc/customer-shell";
import { Card, Note, Bullets, PrimaryLink } from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";

export default function CustomerIntroPage() {
  const { customerCase } = useDemo();
  const name = customerCase?.customerName ?? "ご利用者";

  return (
    <CustomerShell
      stepKey="intro"
      title="住宅ローン診断のご案内"
      subtitle={`${name} 様。まず、無理のない購入予算と通りやすい住宅ローンを確認しましょう。`}
      footer={
        <PrimaryLink href="/loan-checker/customer/identity" className="w-full">
          はじめる（約10分）
        </PrimaryLink>
      }
    >
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">この診断でわかること</h2>
        <Bullets
          items={[
            "購入できる物件価格帯の目安",
            "通りやすい住宅ローン（金融機関・商品）の候補",
            "条件を改善するための次の一手",
          ]}
        />
      </Card>

      <Note tone="info" title="はじめにご確認ください">
        <Bullets
          items={[
            "これは正式な事前審査ではありません（結果は参考値です）",
            "診断には信用情報を利用します（ご同意をいただきます）",
            "所要時間の目安は約10分です",
          ]}
        />
      </Note>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">
          担当者に共有される情報 / されない情報
        </h2>
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div className="mb-1 text-xs font-semibold text-emerald-800">
              共有される（要約のみ）
            </div>
            <Bullets
              items={[
                "借入可能見込み額・購入可能価格帯",
                "金融機関の候補",
                "注意点・改善可能性・推奨アクション",
              ]}
            />
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 text-xs font-semibold text-slate-700">
              共有されない
            </div>
            <Bullets
              items={[
                "信用情報の原票・生データ",
                "個別の借入契約明細・延滞等の具体的内容",
                "内部スコア・本人確認書類の画像",
              ]}
            />
          </div>
        </div>
      </Card>
    </CustomerShell>
  );
}
