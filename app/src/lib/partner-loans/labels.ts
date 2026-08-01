/**
 * Phase 2A-2b: 提携ローンの表示ラベル（日本語）。純粋・表示専用（認可・計算に使わない）。
 * bps/円 は表示時のみ変換する（CLAUDE.md §11）。表示値を金融計算へ再利用しない。
 */

import type {
  PartnerLoanStatus,
  InterestRateType,
  HandlingFeeType,
  PropertyType,
  EmploymentType,
} from "./types";

export function partnerLoanStatusLabel(status: PartnerLoanStatus): string {
  switch (status) {
    case "draft":
      return "下書き";
    case "active":
      return "有効";
    case "inactive":
      return "無効";
  }
}

export function interestRateTypeLabel(t: InterestRateType): string {
  switch (t) {
    case "variable":
      return "変動金利";
    case "fixed":
      return "全期間固定";
    case "fixed_period":
      return "固定期間選択";
  }
}

export function handlingFeeTypeLabel(t: HandlingFeeType): string {
  return t === "fixed_yen" ? "定額" : "定率";
}

export function propertyTypeLabel(t: PropertyType): string {
  switch (t) {
    case "new":
      return "新築";
    case "used":
      return "中古";
    case "condo":
      return "マンション";
    case "house":
      return "戸建て";
  }
}

export function employmentTypeLabel(t: EmploymentType): string {
  switch (t) {
    case "full_time":
      return "正社員";
    case "contract":
      return "契約・派遣";
    case "self_employed":
      return "自営業";
    case "part_time":
      return "パート・アルバイト";
    case "executive":
      return "会社役員";
    case "other":
      return "その他";
  }
}

/** bps → % 表示（例: 125 bps → "1.25%"）。表示専用。 */
export function formatBpsAsPercent(bps: number | null): string {
  if (bps === null) return "—";
  return `${(bps / 100).toFixed(2)}%`;
}

/** 円表示。表示専用。 */
export function formatYen(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("ja-JP")} 円`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ja-JP");
}
