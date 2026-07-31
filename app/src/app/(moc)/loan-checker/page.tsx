/**
 * Loan Checker MoC 入口ページ。MoC の目的とロール別導線・主要画面への近道を示す。
 */

import {
  Card,
  PrimaryLink,
  SecondaryLink,
  Note,
  Bullets,
} from "@/components/loan-checker-moc/ui";
import { SEED_YAMADA_ID } from "@/lib/loan-checker-moc/fixtures";

export const dynamic = "force-dynamic";

export default function LoanCheckerHome() {
  const resultHref = `/loan-checker/cases/${SEED_YAMADA_ID}/result`;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
        Interactive MoC
      </p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">
        モゲチェック Loan Checker
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        信用情報から、買える物件価格、通りやすい住宅ローン、通すための次の一手までを
        一気通貫で示すためのデモです。経営・営業・UX評価用に、顧客招待から診断結果共有までを
        実際に操作できます。
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="text-base font-semibold text-slate-900">
            営業担当者として見る
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            案件一覧・顧客招待・進捗確認・診断結果・金融機関比較・申込戦略。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <PrimaryLink href="/loan-checker/dashboard">
              ダッシュボードを開く
            </PrimaryLink>
            <SecondaryLink href="/loan-checker/cases/new">
              顧客を招待する
            </SecondaryLink>
          </div>
        </Card>
        <Card>
          <h2 className="text-base font-semibold text-slate-900">
            顧客本人として体験する
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            サービス説明・本人確認デモ・情報入力・同意・診断・結果までをスマホ想定で。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <PrimaryLink href="/loan-checker/customer">
              顧客フローを体験
            </PrimaryLink>
            <SecondaryLink href="/loan-checker/admin">
              MFS管理者ビュー
            </SecondaryLink>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">
          差別化の主要4画面（完成度重視）
        </h2>
        <div className="flex flex-wrap gap-2">
          <SecondaryLink href={resultHref}>営業向け診断結果</SecondaryLink>
          <SecondaryLink href="/loan-checker/customer/result">
            顧客向け診断結果
          </SecondaryLink>
          <SecondaryLink href="/loan-checker/lenders">
            金融機関・商品比較
          </SecondaryLink>
          <SecondaryLink href="/loan-checker/simulations">
            改善シミュレーション
          </SecondaryLink>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <SecondaryLink href="/loan-checker/errors">
            例外・エラー画面デモ
          </SecondaryLink>
          <SecondaryLink href="/loan-checker/admin">
            MFS管理者ビュー
          </SecondaryLink>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            TERASSとの差別化
          </h3>
          <Bullets
            items={[
              "銀行タイプ別だけでなく、金融機関・商品単位で結果を提示",
              "理論上限／承認見込み／推奨額／購入可能価格帯を分離",
              "条件改善シミュレーションを提示",
              "候補だけでなく申込順位・申込戦略を提示",
              "診断→モゲチェック相談→事前審査→融資実行への構想を提示",
            ]}
          />
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            推奨デモシナリオ
          </h3>
          <Bullets
            items={[
              "営業: 顧客を招待 → 進捗確認 → 診断結果 → 相談引継ぎ",
              "顧客: 説明 → 本人確認デモ → 入力 → 同意 → 診断 → 結果",
              "差別化: 金融機関比較 → 改善シミュレーション → 申込戦略",
            ]}
          />
        </Card>
      </div>

      <div className="mt-6">
        <Note tone="warn" title="このデモについて">
          <p>
            架空データのみを使用しています。信用情報機関・eKYC事業者・金融機関・
            モゲチェック本番基盤とは接続していません。表示される金額・判定は参考値であり、
            正式な事前審査ではありません。
          </p>
        </Note>
      </div>
    </div>
  );
}
