/**
 * Phase 2A-1: 申込者・招待・参加者の enum 相当型（DB enum と一致させる）。
 * 正本は 0002_phase2a_customer_cases.sql。
 */

export const CASE_APPLICANT_TYPES = ["primary", "co_applicant"] as const;
export type CaseApplicantType = (typeof CASE_APPLICANT_TYPES)[number];

export const CASE_INVITATION_STATUSES = [
  "invited",
  "accepted",
  "expired",
  "cancelled",
] as const;
export type CaseInvitationStatus = (typeof CASE_INVITATION_STATUSES)[number];

export const CASE_PARTICIPANT_ROLES = [
  "primary_applicant",
  "co_applicant",
] as const;
export type CaseParticipantRole = (typeof CASE_PARTICIPANT_ROLES)[number];

export function isCaseApplicantType(v: unknown): v is CaseApplicantType {
  return (
    typeof v === "string" &&
    (CASE_APPLICANT_TYPES as readonly string[]).includes(v)
  );
}
export function isCaseInvitationStatus(v: unknown): v is CaseInvitationStatus {
  return (
    typeof v === "string" &&
    (CASE_INVITATION_STATUSES as readonly string[]).includes(v)
  );
}
export function isCaseParticipantRole(v: unknown): v is CaseParticipantRole {
  return (
    typeof v === "string" &&
    (CASE_PARTICIPANT_ROLES as readonly string[]).includes(v)
  );
}
