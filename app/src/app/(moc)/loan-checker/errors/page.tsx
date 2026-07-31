"use client";

/** 例外・エラー画面デモ（§20）。6状態を切り替えて表示。 */

import { useState } from "react";
import { Note } from "@/components/loan-checker-moc/ui";
import { ErrorPanel } from "@/components/loan-checker-moc/error-panel";
import type { ErrorAction } from "@/components/loan-checker-moc/error-panel";

interface ErrorCase {
  key: string;
  tab: string;
  title: string;
  cause: string;
  actions: ErrorAction[];
}

const CASES: ErrorCase[] = [
  {
    key: "invite-expired",
    tab: "招待期限切れ",
    title: "この招待リンクの有効期限が切れています",
    cause: "セキュリティのため、招待リンクには有効期限があります。担当者に新しい招待の送信を依頼してください。",
    actions: [{ label: "トップへ", href: "/loan-checker", primary: true }],
  },
  {
    key: "identity-failed",
    tab: "本人確認失敗",
    title: "本人確認を完了できませんでした",
    cause: "読み取りがうまくいきませんでした。明るい場所で、もう一度お試しください。別の本人確認方法も選べます。",
    actions: [
      { label: "もう一度試す", href: "/loan-checker/customer/identity", primary: true },
      { label: "別の方法で試す", href: "/loan-checker/customer/identity" },
    ],
  },
  {
    key: "consent-incomplete",
    tab: "同意未完了",
    title: "診断に必要な同意が完了していません",
    cause: "診断を始めるには、必須項目すべてへの同意が必要です。同意画面に戻ってご確認ください。",
    actions: [{ label: "同意画面へ戻る", href: "/loan-checker/customer/consent", primary: true }],
  },
  {
    key: "credit-failed",
    tab: "信用情報照会失敗",
    title: "情報の確認に一時的に失敗しました",
    cause: "一時的に確認ができませんでした。少し時間をおいて、もう一度お試しください。",
    actions: [{ label: "もう一度試す", href: "/loan-checker/customer/processing", primary: true }],
  },
  {
    key: "need-additional",
    tab: "追加確認が必要",
    title: "診断の確定には追加のご確認が必要です",
    cause: "いくつかの項目について、追加の確認が必要です。補足情報のご入力、または担当者へのお問い合わせをお願いします。",
    actions: [
      { label: "補足情報を入力", href: "/loan-checker/customer/supplement", primary: true },
      { label: "担当者へ相談", href: "/loan-checker/consultation" },
    ],
  },
  {
    key: "assessment-expired",
    tab: "診断期限切れ",
    title: "前回の診断結果の有効期限が切れています",
    cause: "診断結果には有効期限があります。最新の状況で、もう一度診断をやり直しましょう。",
    actions: [{ label: "再診断する", href: "/loan-checker/customer", primary: true }],
  },
];

export default function ErrorsShowcasePage() {
  const [active, setActive] = useState(0);
  const c = CASES[active] ?? CASES[0]!;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-lg font-semibold text-slate-900">例外・エラー画面デモ</h1>
      <p className="mt-1 text-sm text-slate-600">
        MoCで用意しているエラー状態です。原因は一般向けに表示し、内部情報は出しません。
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="エラー状態">
        {CASES.map((ec, i) => (
          <button
            key={ec.key}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={
              i === active
                ? "rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-white"
                : "rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            }
          >
            {ec.tab}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <ErrorPanel title={c.title} cause={c.cause} actions={c.actions} />
      </div>

      <div className="mt-4">
        <Note tone="neutral">
          これらは表示デモです。実際のネットワーク障害・APIタイムアウトは再現していません。
        </Note>
      </div>
    </div>
  );
}
