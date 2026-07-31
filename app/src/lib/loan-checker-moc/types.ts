/**
 * Loan Checker MoC 型定義。
 * 本ファイルは MoC（操作可能なデモ）専用。商用審査ロジック・本番データとは無関係。
 * すべて架空データを表現するための型であり、実在の顧客・金融機関を表さない。
 */

export type DemoRole = "agent" | "customer" | "admin";

/** 案件ステータス（デモ用の状態機械） */
export type CaseStatus =
  | "draft" // 下書き
  | "invited" // 招待送信済み
  | "opened" // メール開封済み
  | "identity" // 本人確認中
  | "inputting" // 入力中
  | "consent_pending" // 同意待ち
  | "assessing" // 診断中
  | "assessed" // 診断完了
  | "additional" // 追加確認
  | "consulted" // 相談依頼済み
  | "expired"; // 期限切れ

/** 金融機関判定（色のみに依存しない: ラベル＋記号を併用） */
export type LenderVerdict = "RECOMMENDED" | "LIKELY" | "POSSIBLE" | "DIFFICULT";

export type IdentityMethod = "drivers_license" | "my_number_card";
export type IdentityStatus =
  | "not_started"
  | "in_progress"
  | "verified"
  | "failed";

export type Confidence = "high" | "medium" | "low";

export interface DemoApplicant {
  fullName: string;
  fullNameKana: string;
  birthDate: string; // YYYY-MM-DD（架空）
  age: number;
  email: string;
  address: string;
  phone: string;
}

export interface DemoEmployment {
  employer: string;
  employmentType: string;
  yearsEmployed: number;
  annualIncomePrevYen: number;
  annualIncomeCurrentEstimateYen: number;
  bonusYen: number;
  otherIncomeYen: number;
}

export interface DemoHousehold {
  maritalStatus: string;
  children: number;
  wantsPairLoan: boolean;
  wantsIncomeCombination: boolean;
  hasCoApplicant: boolean;
  coApplicantIncomeYen: number | null;
}

export interface DemoPropertyPreference {
  desiredPriceYen: number;
  desiredLoanYen: number;
  ownFundsYen: number;
  desiredTermYears: number;
  desiredMonthlyPaymentYen: number | null;
  propertyType: string;
  newOrUsed: string;
  location: string;
  sizeSqm: number | null;
  buildingAgeYears: number | null;
  purchaseTiming: string;
}

export interface DemoExistingDebt {
  label: string;
  balanceYen: number;
  monthlyPaymentYen: number;
  plannedPayoff: boolean;
}

export interface DemoSupplement {
  payoffPlannedDebts: string;
  salePlannedProperty: string;
  familySupportYen: number | null;
  futureIncomeChange: string;
  note: string;
}

export interface DemoConsentItem {
  key: string;
  label: string;
  required: boolean;
  granted: boolean;
}

export interface DemoConsent {
  items: DemoConsentItem[];
  sharedFields: string[];
  nonSharedFields: string[];
}

export interface DemoIdentityVerification {
  method: IdentityMethod | null;
  status: IdentityStatus;
}

export interface DemoLenderAssessment {
  id: string;
  lenderName: string; // 架空
  productName: string; // 架空
  verdict: LenderVerdict;
  estimatedLoanLowYen: number;
  estimatedLoanHighYen: number;
  assumedRateBps: number; // 100bps = 1.00%（CLAUDE.md §11）
  reasons: string[];
  cautions: string[];
}

export interface ApplicationStrategy {
  firstChoice: string;
  secondChoice: string;
  backup: string;
  steps: string[];
  cautions: string[];
}

export interface DemoAssessment {
  theoreticalMaxLoanYen: number; // 理論借入上限
  approvableLoanLowYen: number; // 承認見込み（下限）
  approvableLoanHighYen: number; // 承認見込み（上限）
  recommendedLoanLowYen: number; // 推奨借入額（下限）
  recommendedLoanHighYen: number; // 推奨借入額（上限）
  affordablePriceLowYen: number; // 購入可能価格帯（下限）
  affordablePriceHighYen: number; // 購入可能価格帯（上限）
  recommendedPriceLowYen: number; // 推奨物件価格帯（下限）
  recommendedPriceHighYen: number; // 推奨物件価格帯（上限）
  monthlyHousingLowYen: number; // 月額住居費目安（下限）
  monthlyHousingHighYen: number; // 月額住居費目安（上限）
  confidence: Confidence;
  validityDays: number; // 有効期限（診断日からの日数）
  lenders: DemoLenderAssessment[];
  keyCautions: string[];
  additionalChecks: string[];
  improvementNote: string;
  recommendedActions: string[];
  agentTalkingPoints: string[]; // 顧客説明コメント（営業向け）
  strategy: ApplicationStrategy;
}

export interface DemoSimulationRow {
  label: string;
  before: string;
  after: string;
  improved: boolean;
}

export interface DemoSimulation {
  id: string;
  title: string;
  description: string;
  rows: DemoSimulationRow[];
  note: string;
  isCustomerEstimate: boolean; // 顧客自由試算であり正式診断ではない
}

export interface DemoConsultationRequest {
  preferredDate: string;
  method: string;
  topic: string;
  handoverNote: string;
  submitted: boolean;
}

export interface DemoTimelineEvent {
  at: string; // 表示用文字列（架空）
  label: string;
  actor: "営業" | "顧客" | "システム";
}

export interface DemoCustomerFlow {
  identityDone: boolean;
  profileDone: boolean;
  employmentDone: boolean;
  householdDone: boolean;
  propertyDone: boolean;
  supplementDone: boolean;
  consentDone: boolean;
  processingDone: boolean;
}

export interface DemoCase {
  id: string;
  customerName: string;
  caseName: string;
  agentName: string;
  desiredPriceYen: number;
  desiredPropertyName: string;
  message: string;
  status: CaseStatus;
  lastUpdated: string;
  nextAction: string;
  applicant: DemoApplicant;
  employment: DemoEmployment;
  household: DemoHousehold;
  property: DemoPropertyPreference;
  existingDebts: DemoExistingDebt[];
  supplement: DemoSupplement;
  identity: DemoIdentityVerification;
  consent: DemoConsent;
  assessment: DemoAssessment | null;
  timeline: DemoTimelineEvent[];
  flow: DemoCustomerFlow;
  isSeed: boolean;
}

export interface DemoKpi {
  invited: number;
  started: number;
  assessed: number;
  consulted: number;
  preScreening: number;
  completionRatePct: number;
  consultationRatePct: number;
}

export interface InvitePayload {
  customerName: string;
  email: string;
  caseName: string;
  desiredPriceYen: number;
  desiredPropertyName: string;
  message: string;
}
