/**
 * 金利・料率の単位変換（CLAUDE.md §11）
 * - 内部表現は常に整数 bps（100bps = 1.00%）
 * - 計算では bps 整数を維持し、% は表示専用
 * - 表示用の値を金融計算へ再利用しない
 */

export function assertIntegerBps(bps: number): void {
  if (!Number.isSafeInteger(bps)) {
    throw new RangeError(`bps must be a safe integer, got: ${bps}`);
  }
}

/** 表示用: 整数 bps -> % 数値 (72 -> 0.72)。金融計算への再利用禁止。 */
export function bpsToPercent(bps: number): number {
  assertIntegerBps(bps);
  return bps / 100;
}

/** 入力用: % 数値 -> 整数 bps (0.72 -> 72)。0.005% 未満の端数は四捨五入。 */
export function percentToBps(percent: number): number {
  if (!Number.isFinite(percent)) {
    throw new RangeError(`percent must be finite, got: ${percent}`);
  }
  const bps = Math.round(percent * 100);
  assertIntegerBps(bps);
  return bps;
}

/** 表示用: 整数 bps -> "0.72%" 形式の文字列。 */
export function formatPercentFromBps(bps: number, fractionDigits = 2): string {
  assertIntegerBps(bps);
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 6) {
    throw new RangeError(`fractionDigits out of range: ${fractionDigits}`);
  }
  return `${(bps / 100).toFixed(fractionDigits)}%`;
}
