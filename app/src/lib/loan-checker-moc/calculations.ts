/**
 * Loan Checker MoC 決定的計算（デモ用の参考値のみ）。
 * CLAUDE.md §34: 金融計算は UI に置かず純粋関数へ集約する。
 * 本物の審査ロジックではない。同じ入力なら必ず同じ結果を返す（再現性）。
 * 実際の信用情報項目や内部ロジックは推測・再現しない。
 */

/** 元利均等の毎月返済額（円整数）。表示・比較用の簡易計算。 */
export function monthlyPaymentYen(
  principalYen: number,
  annualRateBps: number,
  termYears: number,
): number {
  const n = termYears * 12;
  if (n <= 0) return 0;
  const monthlyRate = annualRateBps / 100 / 100 / 12; // bps → 割合 → 月利
  if (monthlyRate === 0) return Math.round(principalYen / n);
  const factor = Math.pow(1 + monthlyRate, n);
  return Math.round((principalYen * monthlyRate * factor) / (factor - 1));
}

/**
 * 返済比率（DSR）ベースの借入上限の参考値（円整数）。
 * ストレス金利で毎月返済可能額から逆算する簡易モデル。デモ用。
 */
export function maxLoanFromDsr(params: {
  annualIncomeYen: number;
  dsrPct: number; // 許容返済比率（例: 35）
  stressRateBps: number; // 審査金利（例: 300bps = 3.0%）
  termYears: number;
  existingMonthlyYen: number; // 既存借入の毎月返済額
}): number {
  const { annualIncomeYen, dsrPct, stressRateBps, termYears, existingMonthlyYen } =
    params;
  const allowableMonthly =
    (annualIncomeYen * (dsrPct / 100)) / 12 - existingMonthlyYen;
  if (allowableMonthly <= 0) return 0;
  const n = termYears * 12;
  const monthlyRate = stressRateBps / 100 / 100 / 12;
  if (monthlyRate === 0) return Math.round(allowableMonthly * n);
  const factor = Math.pow(1 + monthlyRate, n);
  return Math.round((allowableMonthly * (factor - 1)) / (monthlyRate * factor));
}

/** 円を指定単位（既定 10万円）で下方向に丸める。表示の安定用。 */
export function floorToUnitYen(yen: number, unitYen = 100000): number {
  return Math.floor(yen / unitYen) * unitYen;
}
