/**
 * Loan Checker MoC 定数（ラベル・ステップ定義・デモ表示文言）。
 * 判定表示は色のみに依存させないため、ラベルと記号を併用する（アクセシビリティ）。
 */

import type { CaseStatus, LenderVerdict } from "./types";

export const DEMO_NOTICE = {
  short: "デモ環境・架空データ",
  title: "デモ環境（架空データ）",
  lines: [
    "架空データを表示しています。実在の顧客・金融機関ではありません。",
    "信用情報機関・eKYC事業者・金融機関・モゲチェック本番基盤とは未接続です。",
    "表示される金額・判定はすべて参考値であり、正式な事前審査ではありません。",
  ],
} as const;

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  draft: "下書き",
  invited: "招待送信済み",
  opened: "メール開封済み",
  identity: "本人確認中",
  inputting: "入力中",
  consent_pending: "同意待ち",
  assessing: "診断中",
  assessed: "診断完了",
  additional: "追加確認",
  consulted: "相談依頼済み",
  expired: "期限切れ",
};

/** ステータスのトーン（背景/文字色）。色だけに意味を持たせない前提で補助的に使用。 */
export const CASE_STATUS_TONE: Record<CaseStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  invited: "bg-sky-100 text-sky-800",
  opened: "bg-sky-100 text-sky-800",
  identity: "bg-amber-100 text-amber-800",
  inputting: "bg-amber-100 text-amber-800",
  consent_pending: "bg-amber-100 text-amber-800",
  assessing: "bg-indigo-100 text-indigo-800",
  assessed: "bg-emerald-100 text-emerald-800",
  additional: "bg-orange-100 text-orange-800",
  consulted: "bg-emerald-100 text-emerald-800",
  expired: "bg-rose-100 text-rose-800",
};

export interface VerdictMeta {
  label: string;
  symbol: string;
  description: string;
  toneClass: string;
}

/** 金融機関判定メタ。symbol と label を必ず併記し、色以外でも識別可能にする。 */
export const VERDICT_META: Record<LenderVerdict, VerdictMeta> = {
  RECOMMENDED: {
    label: "推奨",
    symbol: "◎",
    description: "有力な第一候補",
    toneClass: "bg-emerald-50 text-emerald-800 border-emerald-300",
  },
  LIKELY: {
    label: "有望",
    symbol: "○",
    description: "承認が見込める",
    toneClass: "bg-sky-50 text-sky-800 border-sky-300",
  },
  POSSIBLE: {
    label: "可能性あり",
    symbol: "△",
    description: "条件により可能",
    toneClass: "bg-amber-50 text-amber-800 border-amber-300",
  },
  DIFFICULT: {
    label: "要検討",
    symbol: "×",
    description: "現状では難しい",
    toneClass: "bg-rose-50 text-rose-800 border-rose-300",
  },
};

export const CONFIDENCE_LABELS = {
  high: "高",
  medium: "中",
  low: "低",
} as const;

export interface CustomerStep {
  key: string;
  path: string;
  title: string;
}

/** 顧客フローのステップ定義（1画面1テーマ）。 */
export const CUSTOMER_STEPS: CustomerStep[] = [
  { key: "intro", path: "/loan-checker/customer", title: "サービス説明" },
  { key: "identity", path: "/loan-checker/customer/identity", title: "本人確認" },
  { key: "profile", path: "/loan-checker/customer/profile", title: "基本情報" },
  { key: "employment", path: "/loan-checker/customer/employment", title: "勤務・収入" },
  { key: "household", path: "/loan-checker/customer/household", title: "世帯・共同申込" },
  { key: "property", path: "/loan-checker/customer/property", title: "購入希望" },
  { key: "supplement", path: "/loan-checker/customer/supplement", title: "補足情報" },
  { key: "consent", path: "/loan-checker/customer/consent", title: "同意" },
  { key: "processing", path: "/loan-checker/customer/processing", title: "診断中" },
  { key: "result", path: "/loan-checker/customer/result", title: "診断結果" },
];

export interface NavItem {
  path: string;
  label: string;
}

/** 営業担当者向け左ナビ。 */
export const AGENT_NAV: NavItem[] = [
  { path: "/loan-checker/dashboard", label: "ダッシュボード" },
  { path: "/loan-checker/cases", label: "顧客案件一覧" },
  { path: "/loan-checker/cases/new", label: "顧客を招待" },
  { path: "/loan-checker/lenders", label: "金融機関・商品比較" },
  { path: "/loan-checker/simulations", label: "改善シミュレーション" },
];
