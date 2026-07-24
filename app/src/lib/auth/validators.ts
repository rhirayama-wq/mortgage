/**
 * 実行時検証（CLAUDE.md §7: Zodまたは明示的な実行時検証）
 * DB / API から取得した値を型キャストせず、明示検証してから使用する。
 * 依存ゼロの純粋関数（unit test 対象）。
 */

export const SYSTEM_ROLES = ["SYSTEM_ADMIN"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const ORGANIZATION_ROLES = ["ORGANIZATION_ADMIN", "SALES_USER"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const MEMBERSHIP_STATUSES = ["invited", "active", "suspended", "left"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return (
    email.length > 2 && email.length <= 254 && EMAIL_RE.test(email)
  );
}

export class ValidationError extends Error {
  readonly code = "VALIDATION_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function parseSystemRole(value: unknown): SystemRole | null {
  if (value === null || value === undefined) return null;
  if (value === "SYSTEM_ADMIN") return "SYSTEM_ADMIN";
  throw new ValidationError(`unexpected system_role value`);
}

export function parseOrganizationRole(value: unknown): OrganizationRole {
  if (value === "ORGANIZATION_ADMIN" || value === "SALES_USER") return value;
  throw new ValidationError(`unexpected organization role value`);
}

export function parseMembershipStatus(value: unknown): MembershipStatus {
  if (
    value === "invited" ||
    value === "active" ||
    value === "suspended" ||
    value === "left"
  ) {
    return value;
  }
  throw new ValidationError(`unexpected membership status value`);
}

export interface MembershipRow {
  membershipId: string;
  organizationId: string;
  organizationName: string | null;
  role: OrganizationRole;
  status: MembershipStatus;
  invitedEmail: string;
}

/** Supabase から取得した membership 行の実行時検証 */
export function parseMembershipRow(value: unknown): MembershipRow {
  if (typeof value !== "object" || value === null) {
    throw new ValidationError("membership row is not an object");
  }
  const row = value as Record<string, unknown>;
  if (!isUuid(row.id)) throw new ValidationError("membership id is not a uuid");
  if (!isUuid(row.organization_id)) {
    throw new ValidationError("membership organization_id is not a uuid");
  }
  if (typeof row.invited_email !== "string") {
    throw new ValidationError("membership invited_email is not a string");
  }
  let organizationName: string | null = null;
  const org = row.organizations;
  if (org !== null && org !== undefined) {
    if (typeof org !== "object") {
      throw new ValidationError("joined organizations is not an object");
    }
    const name = (org as Record<string, unknown>).name;
    if (name !== null && name !== undefined && typeof name !== "string") {
      throw new ValidationError("organization name is not a string");
    }
    organizationName = (name as string | null | undefined) ?? null;
  }
  return {
    membershipId: row.id,
    organizationId: row.organization_id,
    organizationName,
    role: parseOrganizationRole(row.role),
    status: parseMembershipStatus(row.status),
    invitedEmail: row.invited_email,
  };
}

export interface ProfileRow {
  userId: string;
  email: string;
  displayName: string | null;
  systemRole: SystemRole | null;
}

/** user_profiles 行の実行時検証 */
export function parseProfileRow(value: unknown): ProfileRow {
  if (typeof value !== "object" || value === null) {
    throw new ValidationError("profile row is not an object");
  }
  const row = value as Record<string, unknown>;
  if (!isUuid(row.id)) throw new ValidationError("profile id is not a uuid");
  if (typeof row.email !== "string") {
    throw new ValidationError("profile email is not a string");
  }
  if (
    row.display_name !== null &&
    row.display_name !== undefined &&
    typeof row.display_name !== "string"
  ) {
    throw new ValidationError("profile display_name is not a string");
  }
  return {
    userId: row.id,
    email: row.email,
    displayName: (row.display_name as string | null | undefined) ?? null,
    systemRole: parseSystemRole(row.system_role),
  };
}
