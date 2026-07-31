/**
 * Phase 2A-1: 顧客案件の状態と許容遷移（純粋・DB の enum / guard と一致させる）。
 * 正本は 0002_phase2a_customer_cases.sql の customer_case_status /
 * app_customer_case_transition_allowed。ここはアプリ層の同一定義（決定的）。
 */

export const CUSTOMER_CASE_STATUSES = [
  "draft",
  "invited",
  "opened",
  "inputting",
  "cancelled",
  "expired",
] as const;

export type CustomerCaseStatus = (typeof CUSTOMER_CASE_STATUSES)[number];

export function isCustomerCaseStatus(v: unknown): v is CustomerCaseStatus {
  return (
    typeof v === "string" &&
    (CUSTOMER_CASE_STATUSES as readonly string[]).includes(v)
  );
}

/**
 * 許容遷移（0002 の app_customer_case_transition_allowed と同一）:
 *   draft -> invited / invited -> opened / opened -> inputting /
 *   (draft|invited|opened|inputting) -> cancelled / invited -> expired
 * 未定義遷移は false。
 */
export function customerCaseTransitionAllowed(
  from: CustomerCaseStatus,
  to: CustomerCaseStatus,
): boolean {
  switch (from) {
    case "draft":
      return to === "invited" || to === "cancelled";
    case "invited":
      return to === "opened" || to === "cancelled" || to === "expired";
    case "opened":
      return to === "inputting" || to === "cancelled";
    case "inputting":
      return to === "cancelled";
    case "cancelled":
    case "expired":
      return false; // 終端
    default:
      return false;
  }
}
