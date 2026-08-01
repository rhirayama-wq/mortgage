/**
 * Phase 2A-3a: 申込者の勤務・収入情報の型・純粋バリデーション・DB 行の変換。
 * 正本は 0005_phase2a3a_employment_income.sql（app_upsert_own_applicant_employment_income と
 * 純粋関数 app_employment_income_is_complete / _missing_fields）。
 *
 * 重要:
 *  - 「完了(complete)判定」は DB の純粋関数が唯一の正。ここでは *絶対に* 雇用形態別の
 *    条件付き必須ルールを再実装しない（形式・型・長さ・日付範囲の検証のみ）。
 *  - 財務値（勤務先名・入社年月・年収・収入区分）はログ・エラーメッセージへ出さない
 *    （バリデーション違反はフィールド名のみ返す）。
 *  - 依存ゼロの純粋関数（unit test 対象）。
 */

export const EMPLOYMENT_TYPES = [
  "full_time",
  "contract",
  "part_time",
  "self_employed",
  "executive",
  "pension",
  "unemployed",
  "other",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const INCOME_TYPES = ["salary", "business", "pension", "other"] as const;
export type IncomeType = (typeof INCOME_TYPES)[number];

export function isEmploymentType(v: unknown): v is EmploymentType {
  return typeof v === "string" && (EMPLOYMENT_TYPES as readonly string[]).includes(v);
}
export function isIncomeType(v: unknown): v is IncomeType {
  return typeof v === "string" && (INCOME_TYPES as readonly string[]).includes(v);
}

/** 画面表示用ラベル（select の選択肢・進捗の不足項目表示に共用）。 */
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "正社員",
  contract: "契約・派遣社員",
  part_time: "パート・アルバイト",
  self_employed: "自営業・個人事業主",
  executive: "会社役員",
  pension: "年金受給者",
  unemployed: "無職",
  other: "その他",
};

export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  salary: "給与収入",
  business: "事業収入",
  pension: "年金収入",
  other: "その他",
};

/** DB 側 CHECK / 業務関数の上限と一致させること。 */
export const EMPLOYMENT_INCOME_LIMITS = {
  employerName: 200,
  /** BIGINT 円。JS の安全整数上限内に収める（現実的な上限）。 */
  annualGrossIncomeYen: 9_999_999_999_999,
} as const;

/**
 * フォーム入力（すべて文字列でバインドする）。
 * - employmentStartedOn は月精度の "YYYY-MM"（DB へは月初 "YYYY-MM-01" として送る）。
 * - annualGrossIncomeYen は円の整数文字列（"" は未入力）。
 */
export interface EmploymentIncomeInput {
  employerName: string;
  /** "" または EmploymentType。 */
  employmentType: string;
  /** "" または "YYYY-MM"。 */
  employmentStartedOn: string;
  /** "" または非負整数の文字列（円）。 */
  annualGrossIncomeYen: string;
  /** "" または IncomeType。 */
  incomeType: string;
}

export const EMPTY_EMPLOYMENT_INCOME: EmploymentIncomeInput = {
  employerName: "",
  employmentType: "",
  employmentStartedOn: "",
  annualGrossIncomeYen: "",
  incomeType: "",
};

export type EmploymentIncomeFieldError =
  | "employer_name"
  | "employment_type"
  | "employment_started_on"
  | "annual_gross_income_yen"
  | "income_type";

const MONTH_RE = /^\d{4}-\d{2}$/;
const INT_RE = /^\d+$/;

/**
 * クライアント側の軽量バリデーション（サーバー(DB)側検証が正本）。
 * 空欄は有効（途中保存のため）。値がある場合のみ形式・型・長さ・範囲を検査する。
 * ここでは「雇用形態別の必須(complete)ルール」は検査しない（DB 純粋関数が唯一の正）。
 * 返り値は違反フィールド名の配列（財務値は一切含めない）。
 */
export function validateEmploymentIncome(
  input: EmploymentIncomeInput,
): EmploymentIncomeFieldError[] {
  const errors: EmploymentIncomeFieldError[] = [];

  if (input.employerName.trim().length > EMPLOYMENT_INCOME_LIMITS.employerName) {
    errors.push("employer_name");
  }

  const et = input.employmentType.trim();
  if (et.length > 0 && !isEmploymentType(et)) errors.push("employment_type");

  const started = input.employmentStartedOn.trim();
  if (started.length > 0) {
    if (!MONTH_RE.test(started)) {
      errors.push("employment_started_on");
    } else {
      const [y, m] = started.split("-").map((s) => Number.parseInt(s, 10));
      const t = Date.parse(`${started}-01T00:00:00Z`);
      const min = Date.parse("1900-01-01T00:00:00Z");
      // 未来月は不可（当月は可）。当月の判定は UTC 年月で行う。
      const now = new Date();
      const nowY = now.getUTCFullYear();
      const nowM = now.getUTCMonth() + 1;
      const isFuture = y > nowY || (y === nowY && m > nowM);
      if (m < 1 || m > 12 || Number.isNaN(t) || t < min || isFuture) {
        errors.push("employment_started_on");
      }
    }
  }

  const income = input.annualGrossIncomeYen.trim();
  if (income.length > 0) {
    if (
      !INT_RE.test(income) ||
      Number.parseInt(income, 10) < 0 ||
      Number.parseInt(income, 10) > EMPLOYMENT_INCOME_LIMITS.annualGrossIncomeYen
    ) {
      errors.push("annual_gross_income_yen");
    }
  }

  const it = input.incomeType.trim();
  if (it.length > 0 && !isIncomeType(it)) errors.push("income_type");

  return errors;
}

/** DB(case_applicant_employment_income) の行を画面用の入力値へ変換する（null は空文字）。 */
export function toEmploymentIncomeInput(row: unknown): EmploymentIncomeInput {
  if (typeof row !== "object" || row === null) return { ...EMPTY_EMPLOYMENT_INCOME };
  const r = row as Record<string, unknown>;
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  const started = s(r.employment_started_on);
  return {
    employerName: s(r.employer_name),
    employmentType: s(r.employment_type),
    // DB は date("YYYY-MM-DD")。月入力へ落とす。
    employmentStartedOn: MONTH_RE.test(started.slice(0, 7)) ? started.slice(0, 7) : "",
    annualGrossIncomeYen:
      typeof r.annual_gross_income_yen === "number"
        ? String(r.annual_gross_income_yen)
        : s(r.annual_gross_income_yen),
    incomeType: s(r.income_type),
  };
}

/** 勤務・収入の入力が開始されているか（進捗表示用。財務値は返さない）。 */
export function isEmploymentIncomeStarted(input: EmploymentIncomeInput): boolean {
  return (
    input.employerName.trim().length > 0 ||
    input.employmentType.trim().length > 0 ||
    input.employmentStartedOn.trim().length > 0 ||
    input.annualGrossIncomeYen.trim().length > 0 ||
    input.incomeType.trim().length > 0
  );
}

/** DB 純粋関数が返す missing_fields コード → 画面表示ラベル。 */
export const MISSING_FIELD_LABELS: Record<EmploymentIncomeFieldError, string> = {
  employer_name: "勤務先名",
  employment_type: "雇用形態",
  employment_started_on: "入社年月",
  annual_gross_income_yen: "年収（額面）",
  income_type: "収入区分",
};

/** missing_fields（DB 由来）を日本語ラベルへ写像（未知コードはそのまま無視）。 */
export function missingFieldLabels(codes: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(codes)) return [];
  const out: string[] = [];
  for (const c of codes) {
    if (c in MISSING_FIELD_LABELS) {
      out.push(MISSING_FIELD_LABELS[c as EmploymentIncomeFieldError]);
    }
  }
  return out;
}

/** スタッフ進捗表示のラベル（値は含めない＝完了/入力中/未入力の 3 段のみ）。 */
export type EmploymentIncomeProgressLabel = "未入力" | "入力中" | "完了";

/**
 * スタッフ画面の進捗ラベルを導出する（財務値は使わない／返さない）。
 * started/complete のフラグは DB safe progress RPC 由来。
 */
export function employmentIncomeProgressLabel(
  started: boolean,
  complete: boolean,
): EmploymentIncomeProgressLabel {
  if (complete) return "完了";
  if (started) return "入力中";
  return "未入力";
}

/** フォーム入力 → RPC 引数（"YYYY-MM"→"YYYY-MM-01"、円は number|null）。 */
export interface EmploymentIncomeRpcArgs {
  employerName: string | null;
  employmentType: string | null;
  employmentStartedOn: string | null;
  annualGrossIncomeYen: number | null;
  incomeType: string | null;
}

export function toEmploymentIncomeRpcArgs(
  input: EmploymentIncomeInput,
): EmploymentIncomeRpcArgs {
  const trimOrNull = (v: string): string | null => {
    const t = v.trim();
    return t.length > 0 ? t : null;
  };
  const started = input.employmentStartedOn.trim();
  const income = input.annualGrossIncomeYen.trim();
  return {
    employerName: trimOrNull(input.employerName),
    employmentType: trimOrNull(input.employmentType),
    // 月精度 → 月初日。DB 側でも date_trunc('month') で再正規化する。
    employmentStartedOn: MONTH_RE.test(started) ? `${started}-01` : null,
    annualGrossIncomeYen: INT_RE.test(income) ? Number.parseInt(income, 10) : null,
    incomeType: trimOrNull(input.incomeType),
  };
}
