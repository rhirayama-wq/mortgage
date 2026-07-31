/**
 * 表示用フォーマッタ（MoC デモ用）。
 * CLAUDE.md §11/§34: 金額は円整数で保持し、表示時のみ変換する。
 * ここで得た表示値を金融計算へ再利用しない。
 */

/** 円 → 万円（整数）。表示専用。 */
export function yenToMan(yen: number): number {
  return Math.round(yen / 10000);
}

/** 円 → 「1,234」万（単位語なし） */
export function yenToManString(yen: number): string {
  return yenToMan(yen).toLocaleString("ja-JP");
}

/** 円 → 「1,234万円」 */
export function yenToManYen(yen: number): string {
  return `${yenToManString(yen)}万円`;
}

/** 円レンジ → 「6,800〜7,500万円」 */
export function yenRangeMan(lowYen: number, highYen: number): string {
  if (lowYen === highYen) return yenToManYen(lowYen);
  return `${yenToManString(lowYen)}〜${yenToManString(highYen)}万円`;
}

/** bps → 「0.72%」。100bps = 1.00%（CLAUDE.md §11）。表示専用。 */
export function formatPercentFromBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/** 万円 → 円（入力補助用）。 */
export function manToYen(man: number): number {
  return Math.round(man) * 10000;
}
