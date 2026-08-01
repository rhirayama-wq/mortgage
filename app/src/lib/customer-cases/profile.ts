/**
 * Phase 2A-2a: 顧客申込者の基本情報(PII)の型・純粋バリデーション・DB 行の実行時検証。
 * 正本は 0003_phase2a2_applicant_profile.sql（app_update_own_applicant_profile）。
 * PII を扱うため、ここでは値をログ・エラーメッセージへ出さない（違反はフィールド名のみ返す）。
 * 依存ゼロの純粋関数（unit test 対象）。
 */

export interface BasicApplicantProfileInput {
  fullName: string;
  fullNameKana: string;
  /** "" または "YYYY-MM-DD"。 */
  birthDate: string;
  email: string;
  phone: string;
  postalCode: string;
  address: string;
}

export const EMPTY_BASIC_PROFILE: BasicApplicantProfileInput = {
  fullName: "",
  fullNameKana: "",
  birthDate: "",
  email: "",
  phone: "",
  postalCode: "",
  address: "",
};

/** DB 側 CHECK / 業務関数の長さ上限と一致させること。 */
export const BASIC_PROFILE_LIMITS = {
  fullName: 200,
  fullNameKana: 200,
  phone: 50,
  postalCode: 20,
  address: 500,
} as const;

export type BasicProfileFieldError =
  | "email"
  | "birth_date"
  | "full_name"
  | "full_name_kana"
  | "phone"
  | "postal_code"
  | "address";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * クライアント側の軽量バリデーション（サーバー(DB)側検証が正本）。
 * 空欄は有効（途中保存のため）。値がある場合のみ形式・長さを検査する。
 * 返り値は違反フィールド名の配列（PII 値は一切含めない）。
 */
export function validateBasicProfile(
  input: BasicApplicantProfileInput,
): BasicProfileFieldError[] {
  const errors: BasicProfileFieldError[] = [];

  const email = input.email.trim().toLowerCase();
  if (email.length > 0 && (email.length > 254 || !EMAIL_RE.test(email))) {
    errors.push("email");
  }

  const bd = input.birthDate.trim();
  if (bd.length > 0) {
    if (!DATE_RE.test(bd)) {
      errors.push("birth_date");
    } else {
      const t = Date.parse(`${bd}T00:00:00Z`);
      const min = Date.parse("1900-01-01T00:00:00Z");
      if (Number.isNaN(t) || t < min || t > Date.now()) errors.push("birth_date");
    }
  }

  if (input.fullName.trim().length > BASIC_PROFILE_LIMITS.fullName) {
    errors.push("full_name");
  }
  if (input.fullNameKana.trim().length > BASIC_PROFILE_LIMITS.fullNameKana) {
    errors.push("full_name_kana");
  }
  if (input.phone.trim().length > BASIC_PROFILE_LIMITS.phone) errors.push("phone");
  if (input.postalCode.trim().length > BASIC_PROFILE_LIMITS.postalCode) {
    errors.push("postal_code");
  }
  if (input.address.trim().length > BASIC_PROFILE_LIMITS.address) {
    errors.push("address");
  }

  return errors;
}

/** DB(case_applicant_profiles) の行を画面用の入力値へ変換する（null は空文字）。 */
export function toBasicProfileInput(row: unknown): BasicApplicantProfileInput {
  if (typeof row !== "object" || row === null) return { ...EMPTY_BASIC_PROFILE };
  const r = row as Record<string, unknown>;
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    fullName: s(r.full_name),
    fullNameKana: s(r.full_name_kana),
    birthDate: s(r.birth_date),
    email: s(r.email),
    phone: s(r.phone),
    postalCode: s(r.postal_code),
    address: s(r.address),
  };
}

/** 基本情報の入力が開始されているか（進捗表示用。PII 値は返さない）。 */
export function isBasicProfileStarted(input: BasicApplicantProfileInput): boolean {
  return (
    input.fullName.trim().length > 0 ||
    input.fullNameKana.trim().length > 0 ||
    input.birthDate.trim().length > 0 ||
    input.email.trim().length > 0 ||
    input.phone.trim().length > 0 ||
    input.postalCode.trim().length > 0 ||
    input.address.trim().length > 0
  );
}
