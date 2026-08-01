/**
 * Phase 2A: 顧客案件まわりの表示ラベル（日本語）。純粋・依存ゼロ。
 * 表示専用であり、認可・業務判断には使わない。
 */

import type { CustomerCaseStatus } from "./status";
import type { CaseApplicantType, CaseInvitationStatus } from "./types";

export function customerCaseStatusLabel(status: CustomerCaseStatus): string {
  switch (status) {
    case "draft":
      return "下書き";
    case "invited":
      return "招待済み";
    case "opened":
      return "開封済み";
    case "inputting":
      return "入力中";
    case "cancelled":
      return "キャンセル";
    case "expired":
      return "期限切れ";
  }
}

export function caseApplicantTypeLabel(type: CaseApplicantType): string {
  return type === "primary" ? "主申込者" : "共同申込者";
}

export function caseInvitationStatusLabel(status: CaseInvitationStatus): string {
  switch (status) {
    case "invited":
      return "招待中";
    case "accepted":
      return "受諾済み";
    case "expired":
      return "期限切れ";
    case "cancelled":
      return "取消";
  }
}

/** 円の表示（整数円。表示専用。金融計算には使わない）。 */
export function formatYen(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("ja-JP")} 円`;
}

/** 日付の表示（YYYY/MM/DD。表示専用）。無効値は "—"。 */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ja-JP");
}
