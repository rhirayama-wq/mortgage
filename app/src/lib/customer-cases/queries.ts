/**
 * Phase 2A-2a: 顧客案件のサーバー側読み取り（Server Component 専用）。
 *
 * 方針（CLAUDE.md §8/§9/§18/§34）:
 * - 読み取りは呼出しユーザーのセッション(anon key)で行い、RLS がテナント/参加者分離を担う。
 *   クライアント申告の organizationId 等は信用しない（RLS が導出する）。
 * - DB エラーは「所属なし/未参加」と区別し DataAccessError を throw（fail closed で /error）。
 * - 想定外の enum 値は DataIntegrityError（黙って握りつぶさない）。
 * - PII（氏名等）はスタッフ画面でのみ RLS 許可の範囲で扱い、ログ・URL へ出さない。
 */

import { createSupabaseServerClient } from "../supabase/server";
import { DataAccessError, DataIntegrityError } from "../auth/errors";
import { isCustomerCaseStatus, type CustomerCaseStatus } from "./status";
import {
  isCaseApplicantType,
  isCaseInvitationStatus,
  type CaseApplicantType,
  type CaseInvitationStatus,
} from "./types";
import {
  toBasicProfileInput,
  isBasicProfileStarted,
  type BasicApplicantProfileInput,
} from "./profile";

function asStatus(v: unknown): CustomerCaseStatus {
  if (!isCustomerCaseStatus(v)) {
    throw new DataIntegrityError("unexpected customer_case status");
  }
  return v;
}

type Supa = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** 担当営業 membership id → 表示名（RLS 可視分のみ。不可視は fallback）。 */
async function loadSalesNames(
  supabase: Supa,
  membershipIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(membershipIds)].filter((v) => v.length > 0);
  if (uniq.length === 0) return map;

  const memRes = await supabase
    .from("organization_memberships")
    .select("id, user_id")
    .in("id", uniq);
  if (memRes.error) throw new DataAccessError("failed to load memberships");

  const userByMembership = new Map<string, string>();
  const userIds: string[] = [];
  for (const m of memRes.data ?? []) {
    userByMembership.set(String(m.id), String(m.user_id));
    userIds.push(String(m.user_id));
  }
  if (userIds.length === 0) return map;

  const upRes = await supabase
    .from("user_profiles")
    .select("id, display_name")
    .in("id", userIds);
  if (upRes.error) throw new DataAccessError("failed to load profiles");

  const nameByUser = new Map<string, string>();
  for (const up of upRes.data ?? []) {
    nameByUser.set(
      String(up.id),
      typeof up.display_name === "string" && up.display_name.length > 0
        ? up.display_name
        : "担当者",
    );
  }
  for (const [mid, uid] of userByMembership) {
    const n = nameByUser.get(uid);
    if (n) map.set(mid, n);
  }
  return map;
}

// ---------------------------------------------------------------------------
// スタッフ（営業/法人管理者）向け
// ---------------------------------------------------------------------------

export interface StaffCaseListItem {
  id: string;
  caseName: string;
  status: CustomerCaseStatus;
  desiredPriceYen: number | null;
  updatedAt: string;
  assignedSalesName: string;
  primaryApplicantName: string | null;
  primaryInvitationStatus: CaseInvitationStatus | null;
  primaryAccepted: boolean;
  basicInfoStarted: boolean;
}

/** 現在のスタッフが閲覧できる案件一覧（RLS: 担当営業 or 当該法人 ADMIN）。 */
export async function loadStaffCaseList(): Promise<StaffCaseListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_cases")
    .select("id, case_name, status, desired_price_yen, assigned_membership_id, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new DataAccessError("failed to load customer cases");
  const rows = data ?? [];
  const caseIds = rows.map((r) => String(r.id));

  const salesNames = await loadSalesNames(
    supabase,
    rows.map((r) => String(r.assigned_membership_id)),
  );

  // 主申込者・招待・参加者・PII（氏名/開始状況）をまとめて取得（RLS: スタッフ可視分）。
  const primaryByCase = new Map<
    string,
    { applicantId: string; name: string | null; started: boolean }
  >();
  const inviteStatusByApplicant = new Map<string, CaseInvitationStatus>();
  const acceptedApplicants = new Set<string>();

  if (caseIds.length > 0) {
    const applicantsRes = await supabase
      .from("case_applicants")
      .select("id, case_id, applicant_type")
      .in("case_id", caseIds)
      .eq("applicant_type", "primary");
    if (applicantsRes.error) throw new DataAccessError("failed to load applicants");

    const primaryApplicantIds: string[] = [];
    for (const a of applicantsRes.data ?? []) {
      primaryByCase.set(String(a.case_id), {
        applicantId: String(a.id),
        name: null,
        started: false,
      });
      primaryApplicantIds.push(String(a.id));
    }

    if (primaryApplicantIds.length > 0) {
      const profilesRes = await supabase
        .from("case_applicant_profiles")
        .select(
          "applicant_id, full_name, full_name_kana, birth_date, email, phone, postal_code, address",
        )
        .in("applicant_id", primaryApplicantIds);
      if (profilesRes.error) throw new DataAccessError("failed to load profiles");
      const profileByApplicant = new Map<string, BasicApplicantProfileInput>();
      for (const p of profilesRes.data ?? []) {
        profileByApplicant.set(String(p.applicant_id), toBasicProfileInput(p));
      }
      for (const entry of primaryByCase.values()) {
        const prof = profileByApplicant.get(entry.applicantId);
        if (prof) {
          entry.name = prof.fullName.trim().length > 0 ? prof.fullName : null;
          entry.started = isBasicProfileStarted(prof);
        }
      }

      const invRes = await supabase
        .from("case_invitations")
        .select("applicant_id, status")
        .in("applicant_id", primaryApplicantIds);
      if (invRes.error) throw new DataAccessError("failed to load invitations");
      for (const inv of invRes.data ?? []) {
        if (isCaseInvitationStatus(inv.status)) {
          inviteStatusByApplicant.set(String(inv.applicant_id), inv.status);
        }
      }

      const partRes = await supabase
        .from("case_participants")
        .select("applicant_id")
        .in("applicant_id", primaryApplicantIds);
      if (partRes.error) throw new DataAccessError("failed to load participants");
      for (const p of partRes.data ?? []) {
        acceptedApplicants.add(String(p.applicant_id));
      }
    }
  }

  return rows.map((r) => {
    const id = String(r.id);
    const primary = primaryByCase.get(id);
    return {
      id,
      caseName: String(r.case_name),
      status: asStatus(r.status),
      desiredPriceYen:
        r.desired_price_yen === null || r.desired_price_yen === undefined
          ? null
          : Number(r.desired_price_yen),
      updatedAt: String(r.updated_at),
      assignedSalesName:
        salesNames.get(String(r.assigned_membership_id)) ?? "担当者",
      primaryApplicantName: primary?.name ?? null,
      primaryInvitationStatus: primary
        ? inviteStatusByApplicant.get(primary.applicantId) ?? null
        : null,
      primaryAccepted: primary
        ? acceptedApplicants.has(primary.applicantId)
        : false,
      basicInfoStarted: primary?.started ?? false,
    };
  });
}

export interface StaffApplicantProgress {
  applicantId: string;
  applicantType: CaseApplicantType;
  fullName: string | null;
  invitationStatus: CaseInvitationStatus | null;
  invitationExpiresAt: string | null;
  accepted: boolean;
  basicInfoStarted: boolean;
}

export interface StaffCaseDetail {
  id: string;
  caseName: string;
  status: CustomerCaseStatus;
  desiredPriceYen: number | null;
  assignedSalesName: string;
  createdAt: string;
  updatedAt: string;
  applicants: StaffApplicantProgress[];
  nextAction: string;
}

function computeNextAction(
  status: CustomerCaseStatus,
  applicants: StaffApplicantProgress[],
): string {
  if (status === "cancelled") return "この案件はキャンセルされています。";
  if (status === "expired") return "この案件は期限切れです。";
  const primary = applicants.find((a) => a.applicantType === "primary");
  if (!primary) return "主申込者を招待してください。";
  if (!primary.accepted) return "顧客の招待受諾を待っています。";
  if (!primary.basicInfoStarted) return "顧客の基本情報入力を待っています。";
  return "顧客が基本情報を入力中です。";
}

/** スタッフ向け案件詳細（案件 + 申込者ごとの進捗）。未取得(未認可/不存在)は null。 */
export async function loadStaffCaseDetail(
  caseId: string,
): Promise<StaffCaseDetail | null> {
  const supabase = await createSupabaseServerClient();

  const caseRes = await supabase
    .from("customer_cases")
    .select(
      "id, case_name, status, desired_price_yen, assigned_membership_id, created_at, updated_at",
    )
    .eq("id", caseId)
    .maybeSingle();
  if (caseRes.error) throw new DataAccessError("failed to load customer case");
  if (!caseRes.data) return null;
  const c = caseRes.data;

  const salesNames = await loadSalesNames(supabase, [
    String(c.assigned_membership_id),
  ]);

  const applicantsRes = await supabase
    .from("case_applicants")
    .select("id, applicant_type, status")
    .eq("case_id", caseId)
    .order("applicant_type", { ascending: true });
  if (applicantsRes.error) throw new DataAccessError("failed to load applicants");
  const applicants = applicantsRes.data ?? [];
  const applicantIds = applicants.map((a) => String(a.id));

  const profileByApplicant = new Map<string, BasicApplicantProfileInput>();
  const invByApplicant = new Map<
    string,
    { status: CaseInvitationStatus; expiresAt: string | null }
  >();
  const acceptedApplicants = new Set<string>();

  if (applicantIds.length > 0) {
    const profilesRes = await supabase
      .from("case_applicant_profiles")
      .select(
        "applicant_id, full_name, full_name_kana, birth_date, email, phone, postal_code, address",
      )
      .in("applicant_id", applicantIds);
    if (profilesRes.error) throw new DataAccessError("failed to load profiles");
    for (const p of profilesRes.data ?? []) {
      profileByApplicant.set(String(p.applicant_id), toBasicProfileInput(p));
    }

    const invitationsRes = await supabase
      .from("case_invitations")
      .select("applicant_id, status, expires_at")
      .eq("case_id", caseId);
    if (invitationsRes.error) throw new DataAccessError("failed to load invitations");
    for (const inv of invitationsRes.data ?? []) {
      if (isCaseInvitationStatus(inv.status)) {
        invByApplicant.set(String(inv.applicant_id), {
          status: inv.status,
          expiresAt: inv.expires_at ? String(inv.expires_at) : null,
        });
      }
    }

    const participantsRes = await supabase
      .from("case_participants")
      .select("applicant_id")
      .eq("case_id", caseId);
    if (participantsRes.error) {
      throw new DataAccessError("failed to load participants");
    }
    for (const p of participantsRes.data ?? []) {
      acceptedApplicants.add(String(p.applicant_id));
    }
  }

  const progress: StaffApplicantProgress[] = applicants.map((a) => {
    const id = String(a.id);
    if (!isCaseApplicantType(a.applicant_type)) {
      throw new DataIntegrityError("unexpected applicant_type");
    }
    const profile = profileByApplicant.get(id);
    const inv = invByApplicant.get(id);
    return {
      applicantId: id,
      applicantType: a.applicant_type,
      fullName:
        profile && profile.fullName.trim().length > 0 ? profile.fullName : null,
      invitationStatus: inv?.status ?? null,
      invitationExpiresAt: inv?.expiresAt ?? null,
      accepted: acceptedApplicants.has(id),
      basicInfoStarted: profile ? isBasicProfileStarted(profile) : false,
    };
  });

  const status = asStatus(c.status);
  return {
    id: String(c.id),
    caseName: String(c.case_name),
    status,
    desiredPriceYen:
      c.desired_price_yen === null || c.desired_price_yen === undefined
        ? null
        : Number(c.desired_price_yen),
    assignedSalesName:
      salesNames.get(String(c.assigned_membership_id)) ?? "担当者",
    createdAt: String(c.created_at),
    updatedAt: String(c.updated_at),
    applicants: progress,
    nextAction: computeNextAction(status, progress),
  };
}

export interface OrgActiveMember {
  membershipId: string;
  displayName: string;
  role: "ORGANIZATION_ADMIN" | "SALES_USER";
}

/**
 * 案件の担当割当セレクタ用の active メンバー一覧（RLS: ADMIN は自法人分・SALES は自分のみ可視）。
 * SALES_USER が呼ぶと自分の membership しか見えない（RLS）ため、実質「自分のみ」。
 */
export async function loadOrgActiveMembers(
  organizationId: string,
): Promise<OrgActiveMember[]> {
  const supabase = await createSupabaseServerClient();
  const memRes = await supabase
    .from("organization_memberships")
    .select("id, user_id, role, status")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  if (memRes.error) throw new DataAccessError("failed to load members");
  const rows = memRes.data ?? [];
  const userIds = rows.map((m) => String(m.user_id));
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const upRes = await supabase
      .from("user_profiles")
      .select("id, display_name, email")
      .in("id", userIds);
    if (upRes.error) throw new DataAccessError("failed to load profiles");
    for (const up of upRes.data ?? []) {
      const label =
        typeof up.display_name === "string" && up.display_name.length > 0
          ? up.display_name
          : typeof up.email === "string"
            ? up.email
            : "メンバー";
      names.set(String(up.id), label);
    }
  }
  return rows
    .filter(
      (m) => m.role === "ORGANIZATION_ADMIN" || m.role === "SALES_USER",
    )
    .map((m) => ({
      membershipId: String(m.id),
      displayName: names.get(String(m.user_id)) ?? "メンバー",
      role: m.role as "ORGANIZATION_ADMIN" | "SALES_USER",
    }));
}

// ---------------------------------------------------------------------------
// 顧客（case_participants 経由・organization 非所属）向け
// ---------------------------------------------------------------------------

export interface CustomerCaseListItem {
  id: string;
  caseName: string;
  status: CustomerCaseStatus;
  organizationName: string;
  assignedSalesName: string;
  updatedAt: string;
}

export interface CustomerPendingInvitation {
  invitationId: string;
  expiresAt: string;
}

export interface CustomerPortal {
  cases: CustomerCaseListItem[];
  invitations: CustomerPendingInvitation[];
}

/** 顧客ポータル: 参加中の案件（法人名・担当営業名つき）+ 自分宛の保留中招待。 */
export async function loadCustomerPortal(): Promise<CustomerPortal> {
  const supabase = await createSupabaseServerClient();

  // 顧客は organizations / memberships を RLS で読めないため、定義者関数で安全に取得。
  const casesRes = await supabase.rpc("app_customer_portal_cases");
  if (casesRes.error) throw new DataAccessError("failed to load customer cases");

  const invitationsRes = await supabase
    .from("case_invitations")
    .select("id, expires_at, status")
    .eq("status", "invited");
  if (invitationsRes.error) {
    throw new DataAccessError("failed to load invitations");
  }

  const cases: CustomerCaseListItem[] = (
    (casesRes.data as unknown[] | null) ?? []
  ).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.case_id),
      caseName: String(r.case_name),
      status: asStatus(r.status),
      organizationName:
        typeof r.organization_name === "string" ? r.organization_name : "",
      assignedSalesName:
        typeof r.assigned_sales_name === "string"
          ? r.assigned_sales_name
          : "担当者",
      updatedAt: String(r.updated_at),
    };
  });

  return {
    cases,
    invitations: (invitationsRes.data ?? []).map((r) => ({
      invitationId: String(r.id),
      expiresAt: String(r.expires_at),
    })),
  };
}

export interface CustomerCaseView {
  caseId: string;
  caseName: string;
  status: CustomerCaseStatus;
  applicantId: string;
  applicantType: CaseApplicantType;
  profile: BasicApplicantProfileInput;
}

/**
 * 顧客本人の 1 案件ビュー（自分の申込者 + 自分の PII のみ）。
 * 参加していない/存在しない場合は null（notFound 相当。障害とは区別する）。
 */
export async function loadCustomerCaseView(
  caseId: string,
): Promise<CustomerCaseView | null> {
  const supabase = await createSupabaseServerClient();

  const partRes = await supabase
    .from("case_participants")
    .select("applicant_id")
    .eq("case_id", caseId)
    .limit(1)
    .maybeSingle();
  if (partRes.error) throw new DataAccessError("failed to load participant");
  if (!partRes.data) return null;
  const applicantId = String(partRes.data.applicant_id);

  const caseRes = await supabase
    .from("customer_cases")
    .select("id, case_name, status")
    .eq("id", caseId)
    .maybeSingle();
  if (caseRes.error) throw new DataAccessError("failed to load customer case");
  if (!caseRes.data) return null;

  const applicantRes = await supabase
    .from("case_applicants")
    .select("id, applicant_type, status")
    .eq("id", applicantId)
    .maybeSingle();
  if (applicantRes.error) throw new DataAccessError("failed to load applicant");
  if (!applicantRes.data) return null;
  if (!isCaseApplicantType(applicantRes.data.applicant_type)) {
    throw new DataIntegrityError("unexpected applicant_type");
  }

  const profileRes = await supabase
    .from("case_applicant_profiles")
    .select(
      "full_name, full_name_kana, birth_date, email, phone, postal_code, address",
    )
    .eq("applicant_id", applicantId)
    .maybeSingle();
  if (profileRes.error) throw new DataAccessError("failed to load profile");

  return {
    caseId: String(caseRes.data.id),
    caseName: String(caseRes.data.case_name),
    status: asStatus(caseRes.data.status),
    applicantId,
    applicantType: applicantRes.data.applicant_type,
    profile: toBasicProfileInput(profileRes.data),
  };
}
