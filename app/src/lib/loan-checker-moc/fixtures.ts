/**
 * Loan Checker MoC 架空データ（fixtures）。
 * すべて @example.test の架空人物・架空金融機関。実在の顧客・金融機関・商品を表さない。
 * 注: 仕様サンプルの「フラット35」は実在ブランドのため、架空の長期固定商品で代替表現している。
 */

import type {
  ApplicationStrategy,
  DemoAssessment,
  DemoCase,
  DemoConsent,
  DemoCustomerFlow,
  DemoIdentityVerification,
  DemoKpi,
  DemoLenderAssessment,
  DemoSimulation,
  DemoTimelineEvent,
  CaseStatus,
  DemoExistingDebt,
} from "./types";

const MAN = 10000;

/** 同意項目テンプレート（§9.14）。granted で初期状態を切替。 */
export function defaultConsent(granted: boolean): DemoConsent {
  return {
    items: [
      { key: "service", label: "サービスの利用", required: true, granted },
      { key: "credit_fetch", label: "信用情報の取得", required: true, granted },
      { key: "credit_analyze", label: "信用情報の分析", required: true, granted },
      {
        key: "share_agent",
        label: "診断結果の不動産会社への共有",
        required: true,
        granted,
      },
      {
        key: "mogecheck_contact",
        label: "モゲチェックからの連絡",
        required: false,
        granted,
      },
      {
        key: "handover",
        label: "住宅ローン相談への引継ぎ",
        required: false,
        granted,
      },
    ],
    sharedFields: [
      "借入可能見込み額",
      "購入可能価格帯",
      "金融機関候補",
      "注意事項",
      "改善可能性",
      "推奨アクション",
    ],
    nonSharedFields: [
      "信用情報の原票",
      "個別の借入契約明細",
      "延滞等の具体的内容",
      "内部スコア",
      "生データ",
      "本人確認書類の画像",
    ],
  };
}

/** 標準デモケース（山田 太郎）の金融機関候補（§10）。すべて架空。 */
const YAMADA_LENDERS: DemoLenderAssessment[] = [
  {
    id: "lender-mirai",
    lenderName: "みらいネット銀行",
    productName: "変動金利住宅ローン",
    verdict: "RECOMMENDED",
    estimatedLoanLowYen: 7000 * MAN,
    estimatedLoanHighYen: 7400 * MAN,
    assumedRateBps: 72,
    reasons: [
      "年収基準を充足しています",
      "勤続年数を充足しています",
      "既存借入を考慮しても返済比率の範囲内です",
    ],
    cautions: ["物件の担保評価の確認が必要です"],
  },
  {
    id: "lender-chuo",
    lenderName: "日本中央みらい銀行",
    productName: "住宅ローン標準プラン",
    verdict: "LIKELY",
    estimatedLoanLowYen: 6800 * MAN,
    estimatedLoanHighYen: 7200 * MAN,
    assumedRateBps: 85,
    reasons: ["属性が安定しています", "自己資金があります"],
    cautions: ["自動車ローンの完済予定の確認が必要です"],
  },
  {
    id: "lender-sakura",
    lenderName: "さくら地方みらい銀行",
    productName: "地域住宅ローン",
    verdict: "POSSIBLE",
    estimatedLoanLowYen: 6500 * MAN,
    estimatedLoanHighYen: 7000 * MAN,
    assumedRateBps: 95,
    reasons: ["返済比率は許容範囲です"],
    cautions: ["勤務先確認書類が必要です"],
  },
  {
    id: "lender-long",
    lenderName: "住宅金融サポート機構（架空）",
    productName: "全期間固定プラン ロング35",
    verdict: "LIKELY",
    estimatedLoanLowYen: 6700 * MAN,
    estimatedLoanHighYen: 7100 * MAN,
    assumedRateBps: 180,
    reasons: ["長期固定で返済計画が立てやすい商品です"],
    cautions: ["物件の技術基準の確認が必要です"],
  },
];

const YAMADA_STRATEGY: ApplicationStrategy = {
  firstChoice: "みらいネット銀行（変動金利住宅ローン）",
  secondChoice: "日本中央みらい銀行（住宅ローン標準プラン）",
  backup: "住宅金融サポート機構（架空）全期間固定プラン ロング35",
  steps: [
    "みらいネット銀行へ事前審査を申し込む",
    "日本中央みらい銀行を並行して検討する",
    "長期固定プランをバックアップとして準備する",
  ],
  cautions: [
    "無差別な複数申込は避けてください（申込履歴が残ります）",
    "実際の申込前にモゲチェック担当者が確認します",
    "本MoCでは実際の申込は行いません",
  ],
};

/** 山田 太郎 の診断結果（§10）。curated fixture・参考値。 */
export const YAMADA_ASSESSMENT: DemoAssessment = {
  theoreticalMaxLoanYen: 8200 * MAN,
  approvableLoanLowYen: 6800 * MAN,
  approvableLoanHighYen: 7400 * MAN,
  recommendedLoanLowYen: 6300 * MAN,
  recommendedLoanHighYen: 6800 * MAN,
  affordablePriceLowYen: 6800 * MAN,
  affordablePriceHighYen: 7500 * MAN,
  recommendedPriceLowYen: 6800 * MAN,
  recommendedPriceHighYen: 7300 * MAN,
  monthlyHousingLowYen: 19 * MAN,
  monthlyHousingHighYen: 22 * MAN,
  confidence: "high",
  validityDays: 30,
  lenders: YAMADA_LENDERS,
  keyCautions: [
    "希望借入額（7,500万円）は承認見込みの上限をやや上回ります",
    "自動車ローン（残高180万円）が返済比率に影響しています",
    "物件の担保評価により最終的な借入可能額は変動します",
  ],
  additionalChecks: [
    "自動車ローンの完済予定・時期",
    "当年度の見込み年収の裏付け",
    "対象物件の担保評価",
  ],
  improvementNote:
    "自動車ローンの完済や自己資金の増額により、承認見込み額と候補金融機関が広がる可能性があります。",
  recommendedActions: [
    "希望物件価格を推奨価格帯（6,800〜7,300万円）で再検討する",
    "みらいネット銀行を第1候補として事前審査を進める",
    "自動車ローンの完済可否を顧客と確認する",
  ],
  agentTalkingPoints: [
    "『理論上の上限』と『実際に通りやすい額』は異なります。無理のない推奨額でご提案します。",
    "自動車ローンを完済いただくと、選べる銀行と借入額の幅が広がります。",
    "この結果は参考値です。正式な結論は各金融機関の審査で確定します。",
  ],
  strategy: YAMADA_STRATEGY,
};

/** 改善シミュレーション（§11）。最低3パターン。 */
export const SIMULATIONS: DemoSimulation[] = [
  {
    id: "sim-payoff-car",
    title: "シナリオA: 自動車ローンを完済する",
    description:
      "残高180万円の自動車ローンを完済すると、返済比率に余裕が生まれます。",
    rows: [
      {
        label: "承認見込み借入額（上限）",
        before: "7,400万円",
        after: "7,800万円",
        improved: true,
      },
      {
        label: "推奨金融機関数",
        before: "4行",
        after: "6行",
        improved: true,
      },
      {
        label: "日本中央みらい銀行の判定",
        before: "有望（○）",
        after: "推奨（◎）",
        improved: true,
      },
    ],
    note: "月々の返済負担が減り、審査上の余裕が生まれます。",
    isCustomerEstimate: false,
  },
  {
    id: "sim-add-funds",
    title: "シナリオB: 自己資金を300万円増額する",
    description: "自己資金を500万円→800万円に増やした場合の変化です。",
    rows: [
      {
        label: "推奨物件価格帯（上限）",
        before: "7,300万円",
        after: "7,600万円",
        improved: true,
      },
      {
        label: "担保評価上の余裕",
        before: "標準",
        after: "改善",
        improved: true,
      },
      {
        label: "候補商品数",
        before: "4商品",
        after: "5商品",
        improved: true,
      },
    ],
    note: "頭金が増えることで、借入額と担保評価の両面で余裕が生まれます。",
    isCustomerEstimate: false,
  },
  {
    id: "sim-pair-loan",
    title: "シナリオC: ペアローンを利用する",
    description:
      "配偶者と収入を合算（ペアローン）した場合の試算です。共同申込者の本人確認・同意が別途必要です。",
    rows: [
      {
        label: "購入可能価格帯（上限）",
        before: "7,500万円",
        after: "最大 8,800万円",
        improved: true,
      },
      {
        label: "必要な追加手続き",
        before: "なし",
        after: "共同申込者の本人確認・同意",
        improved: false,
      },
    ],
    note: "これは顧客自由試算であり、正式な診断ではありません。共同申込者の情報が必要です。",
    isCustomerEstimate: true,
  },
];

/** ダッシュボードKPI（§14）。デモ値。 */
export const DEMO_KPI: DemoKpi = {
  invited: 24,
  started: 19,
  assessed: 15,
  consulted: 8,
  preScreening: 5,
  completionRatePct: 62.5,
  consultationRatePct: 53.3,
};

export function emptyFlow(): DemoCustomerFlow {
  return {
    identityDone: false,
    profileDone: false,
    employmentDone: false,
    householdDone: false,
    propertyDone: false,
    supplementDone: false,
    consentDone: false,
    processingDone: false,
  };
}

export function completedFlow(): DemoCustomerFlow {
  return {
    identityDone: true,
    profileDone: true,
    employmentDone: true,
    householdDone: true,
    propertyDone: true,
    supplementDone: true,
    consentDone: true,
    processingDone: true,
  };
}

interface MakeCaseInput {
  id: string;
  customerName: string;
  customerKana: string;
  email: string;
  caseName: string;
  agentName: string;
  desiredPriceYen: number;
  desiredLoanYen: number;
  ownFundsYen: number;
  desiredPropertyName: string;
  location: string;
  age: number;
  incomePrevYen: number;
  status: CaseStatus;
  lastUpdated: string;
  nextAction: string;
  message?: string;
  existingDebts?: DemoExistingDebt[];
  identity?: DemoIdentityVerification;
  consentGranted?: boolean;
  assessment?: DemoAssessment | null;
  flow?: DemoCustomerFlow;
  timeline?: DemoTimelineEvent[];
}

/** 既定値付きの案件ファクトリ。型の全フィールドを埋める。 */
function makeCase(i: MakeCaseInput): DemoCase {
  return {
    id: i.id,
    customerName: i.customerName,
    caseName: i.caseName,
    agentName: i.agentName,
    desiredPriceYen: i.desiredPriceYen,
    desiredPropertyName: i.desiredPropertyName,
    message: i.message ?? "",
    status: i.status,
    lastUpdated: i.lastUpdated,
    nextAction: i.nextAction,
    applicant: {
      fullName: i.customerName,
      fullNameKana: i.customerKana,
      birthDate: `${2026 - i.age}-05-12`,
      age: i.age,
      email: i.email,
      address: "東京都〇〇区△△ 1-2-3（架空）",
      phone: "090-0000-0000（架空）",
    },
    employment: {
      employer: "架空商事株式会社",
      employmentType: "正社員",
      yearsEmployed: 6,
      annualIncomePrevYen: i.incomePrevYen,
      annualIncomeCurrentEstimateYen: i.incomePrevYen,
      bonusYen: 0,
      otherIncomeYen: 0,
    },
    household: {
      maritalStatus: "既婚",
      children: 0,
      wantsPairLoan: false,
      wantsIncomeCombination: false,
      hasCoApplicant: false,
      coApplicantIncomeYen: null,
    },
    property: {
      desiredPriceYen: i.desiredPriceYen,
      desiredLoanYen: i.desiredLoanYen,
      ownFundsYen: i.ownFundsYen,
      desiredTermYears: 35,
      desiredMonthlyPaymentYen: null,
      propertyType: "マンション",
      newOrUsed: "新築",
      location: i.location,
      sizeSqm: 70,
      buildingAgeYears: 0,
      purchaseTiming: "6か月以内",
    },
    existingDebts: i.existingDebts ?? [],
    supplement: {
      payoffPlannedDebts: "",
      salePlannedProperty: "",
      familySupportYen: null,
      futureIncomeChange: "",
      note: "",
    },
    identity: i.identity ?? { method: null, status: "not_started" },
    consent: defaultConsent(i.consentGranted ?? false),
    assessment: i.assessment ?? null,
    timeline: i.timeline ?? [],
    flow: i.flow ?? emptyFlow(),
    isSeed: true,
  };
}

/** 標準デモケース（山田 太郎）。診断完了済みで、営業/顧客の結果画面をすぐ確認できる。 */
export const SEED_YAMADA_ID = "seed-yamada";

const YAMADA_TIMELINE: DemoTimelineEvent[] = [
  { at: "07/24 10:12", label: "顧客を招待", actor: "営業" },
  { at: "07/24 18:40", label: "招待メールを開封", actor: "顧客" },
  { at: "07/25 09:05", label: "本人確認が完了", actor: "顧客" },
  { at: "07/25 09:30", label: "勤務・収入情報を入力", actor: "顧客" },
  { at: "07/25 09:52", label: "各種同意を取得", actor: "顧客" },
  { at: "07/25 09:55", label: "診断が完了", actor: "システム" },
];

export const SEED_CASES: DemoCase[] = [
  makeCase({
    id: SEED_YAMADA_ID,
    customerName: "山田 太郎",
    customerKana: "ヤマダ タロウ",
    email: "taro.yamada@example.test",
    caseName: "山田様 新築マンション購入",
    agentName: "営業 三田",
    desiredPriceYen: 8000 * MAN,
    desiredLoanYen: 7500 * MAN,
    ownFundsYen: 500 * MAN,
    desiredPropertyName: "（仮）港区新築マンション",
    location: "東京都港区（架空）",
    age: 38,
    incomePrevYen: 900 * MAN,
    status: "assessed",
    lastUpdated: "07/25 09:55",
    nextAction: "診断結果を確認し、モゲチェック相談へ引き継ぐ",
    existingDebts: [
      {
        label: "自動車ローン",
        balanceYen: 180 * MAN,
        monthlyPaymentYen: 35000,
        plannedPayoff: false,
      },
    ],
    identity: { method: "drivers_license", status: "verified" },
    consentGranted: true,
    assessment: YAMADA_ASSESSMENT,
    flow: completedFlow(),
    timeline: YAMADA_TIMELINE,
  }),
  makeCase({
    id: "seed-sato",
    customerName: "佐藤 花子",
    customerKana: "サトウ ハナコ",
    email: "hanako.sato@example.test",
    caseName: "佐藤様 中古マンション購入",
    agentName: "営業 三田",
    desiredPriceYen: 5500 * MAN,
    desiredLoanYen: 5000 * MAN,
    ownFundsYen: 500 * MAN,
    desiredPropertyName: "（仮）世田谷区中古マンション",
    location: "東京都世田谷区（架空）",
    age: 34,
    incomePrevYen: 620 * MAN,
    status: "inputting",
    lastUpdated: "07/30 21:14",
    nextAction: "顧客の入力完了を待っています",
    identity: { method: "my_number_card", status: "verified" },
    timeline: [
      { at: "07/29 11:00", label: "顧客を招待", actor: "営業" },
      { at: "07/30 20:50", label: "本人確認が完了", actor: "顧客" },
    ],
  }),
  makeCase({
    id: "seed-suzuki",
    customerName: "鈴木 一郎",
    customerKana: "スズキ イチロウ",
    email: "ichiro.suzuki@example.test",
    caseName: "鈴木様 戸建て購入",
    agentName: "営業 大川",
    desiredPriceYen: 6200 * MAN,
    desiredLoanYen: 5800 * MAN,
    ownFundsYen: 400 * MAN,
    desiredPropertyName: "（仮）川崎市新築戸建て",
    location: "神奈川県川崎市（架空）",
    age: 41,
    incomePrevYen: 780 * MAN,
    status: "invited",
    lastUpdated: "07/31 08:02",
    nextAction: "顧客のアクセスを待っています",
    timeline: [{ at: "07/31 08:02", label: "顧客を招待", actor: "営業" }],
  }),
  makeCase({
    id: "seed-takahashi",
    customerName: "高橋 美咲",
    customerKana: "タカハシ ミサキ",
    email: "misaki.takahashi@example.test",
    caseName: "高橋様 マンション購入",
    agentName: "営業 三田",
    desiredPriceYen: 4800 * MAN,
    desiredLoanYen: 4300 * MAN,
    ownFundsYen: 500 * MAN,
    desiredPropertyName: "（仮）横浜市中古マンション",
    location: "神奈川県横浜市（架空）",
    age: 36,
    incomePrevYen: 560 * MAN,
    status: "consent_pending",
    lastUpdated: "07/31 07:40",
    nextAction: "顧客の同意取得を待っています",
    identity: { method: "drivers_license", status: "verified" },
    timeline: [
      { at: "07/30 10:00", label: "顧客を招待", actor: "営業" },
      { at: "07/31 07:35", label: "情報入力が完了", actor: "顧客" },
    ],
  }),
  makeCase({
    id: "seed-tanaka",
    customerName: "田中 健太",
    customerKana: "タナカ ケンタ",
    email: "kenta.tanaka@example.test",
    caseName: "田中様 新築マンション購入",
    agentName: "営業 大川",
    desiredPriceYen: 7000 * MAN,
    desiredLoanYen: 6500 * MAN,
    ownFundsYen: 500 * MAN,
    desiredPropertyName: "（仮）さいたま市新築マンション",
    location: "埼玉県さいたま市（架空）",
    age: 39,
    incomePrevYen: 830 * MAN,
    status: "assessing",
    lastUpdated: "07/31 09:12",
    nextAction: "診断処理中です",
    identity: { method: "my_number_card", status: "verified" },
    timeline: [
      { at: "07/31 08:30", label: "各種同意を取得", actor: "顧客" },
      { at: "07/31 09:12", label: "診断を開始", actor: "システム" },
    ],
  }),
  makeCase({
    id: "seed-ito",
    customerName: "伊藤 涼",
    customerKana: "イトウ リョウ",
    email: "ryo.ito@example.test",
    caseName: "伊藤様 タワーマンション購入",
    agentName: "営業 三田",
    desiredPriceYen: 9000 * MAN,
    desiredLoanYen: 8500 * MAN,
    ownFundsYen: 500 * MAN,
    desiredPropertyName: "（仮）中央区タワーマンション",
    location: "東京都中央区（架空）",
    age: 44,
    incomePrevYen: 1100 * MAN,
    status: "additional",
    lastUpdated: "07/29 16:20",
    nextAction: "追加確認（勤続・当年度収入の裏付け）を依頼",
    identity: { method: "drivers_license", status: "verified" },
    timeline: [
      { at: "07/28 14:00", label: "情報入力が完了", actor: "顧客" },
      { at: "07/29 16:20", label: "追加確認が必要と判定", actor: "システム" },
    ],
  }),
  makeCase({
    id: "seed-watanabe",
    customerName: "渡辺 さくら",
    customerKana: "ワタナベ サクラ",
    email: "sakura.watanabe@example.test",
    caseName: "渡辺様 中古戸建て購入",
    agentName: "営業 大川",
    desiredPriceYen: 6000 * MAN,
    desiredLoanYen: 5500 * MAN,
    ownFundsYen: 500 * MAN,
    desiredPropertyName: "（仮）武蔵野市中古戸建て",
    location: "東京都武蔵野市（架空）",
    age: 37,
    incomePrevYen: 700 * MAN,
    status: "consulted",
    lastUpdated: "07/28 13:05",
    nextAction: "モゲチェック相談の日程調整中",
    identity: { method: "my_number_card", status: "verified" },
    consentGranted: true,
    timeline: [
      { at: "07/27 10:00", label: "診断が完了", actor: "システム" },
      { at: "07/28 13:05", label: "モゲチェック相談を申込", actor: "顧客" },
    ],
  }),
  makeCase({
    id: "seed-nakamura",
    customerName: "中村 大輔",
    customerKana: "ナカムラ ダイスケ",
    email: "daisuke.nakamura@example.test",
    caseName: "中村様 マンション購入",
    agentName: "営業 三田",
    desiredPriceYen: 5000 * MAN,
    desiredLoanYen: 4500 * MAN,
    ownFundsYen: 500 * MAN,
    desiredPropertyName: "（仮）浦安市中古マンション",
    location: "千葉県浦安市（架空）",
    age: 45,
    incomePrevYen: 650 * MAN,
    status: "expired",
    lastUpdated: "06/20 09:00",
    nextAction: "診断の有効期限が切れています。再診断を案内",
    timeline: [
      { at: "05/20 09:00", label: "診断が完了", actor: "システム" },
      { at: "06/20 09:00", label: "有効期限切れ", actor: "システム" },
    ],
  }),
];

/** 招待入力から新規案件を生成（架空データのみ）。 */
export function createCaseFromInvite(input: {
  id: string;
  customerName: string;
  email: string;
  caseName: string;
  desiredPriceYen: number;
  desiredPropertyName: string;
  message: string;
  lastUpdated: string;
}): DemoCase {
  return makeCase({
    id: input.id,
    customerName: input.customerName,
    customerKana: "（架空）",
    email: input.email,
    caseName: input.caseName || `${input.customerName}様 案件`,
    agentName: "営業 三田",
    desiredPriceYen: input.desiredPriceYen,
    desiredLoanYen: Math.max(0, input.desiredPriceYen - 500 * MAN),
    ownFundsYen: 500 * MAN,
    desiredPropertyName: input.desiredPropertyName,
    location: "（架空・未入力）",
    age: 38,
    incomePrevYen: 700 * MAN,
    status: "invited",
    lastUpdated: input.lastUpdated,
    nextAction: "顧客のアクセスを待っています",
    message: input.message,
    timeline: [{ at: input.lastUpdated, label: "顧客を招待", actor: "営業" }],
  });
}
