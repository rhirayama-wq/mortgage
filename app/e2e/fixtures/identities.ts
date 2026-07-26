/**
 * E2E 認証済みフィクスチャの「唯一の定義元」。
 * FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
 *
 * - 架空メール（@example.test）のみ。実在の人物・企業・金融機関は使わない。
 * - パスワード・token・Cookie などの秘密値はここに一切置かない
 *   （セッションは実行時に GoTrue Admin API の magic link から生成する）。
 * - `sysadmin.fictional@example.test` は supabase/seed.sql が作る既存 fixture を
 *   そのまま再利用する（重複ユーザーを作らない）。
 * - Phase 2 の業務 E2E も、このファイルの定義と storageState をそのまま使う。
 */

import { resolve } from "node:path";

export type FixtureKey =
  | "systemAdmin"
  | "orgAAdmin"
  | "orgAMember"
  | "orgBAdmin"
  | "orgBInvitee"
  | "invited"
  | "suspended"
  | "left";

export type OrgKey = "A" | "B";
export type OrgRole = "ORGANIZATION_ADMIN" | "SALES_USER";
/** membership の最終状態。"none" は membership を作らない（SYSTEM_ADMIN 単独）。 */
export type FixtureMembershipState = "none" | "invited" | "active" | "suspended" | "left";

export interface FixtureIdentity {
  readonly key: FixtureKey;
  readonly email: string;
  readonly systemRole: "SYSTEM_ADMIN" | null;
  readonly org: OrgKey | null;
  readonly orgRole: OrgRole | null;
  readonly state: FixtureMembershipState;
  /** seed.sql 由来。setup では新規作成せず既存ユーザーを再利用する。 */
  readonly seeded: boolean;
  /** storageState を生成するか。 */
  readonly needsSession: boolean;
  /** E2E 上の用途（docs と 1:1 で対応させる）。 */
  readonly purpose: string;
}

/** 架空法人名（setup はこの名前で冪等に法人を解決／作成する）。 */
export const ORG_A_NAME = "E2E検証法人A（架空）";
export const ORG_B_NAME = "E2E検証法人B（架空）";

/** seed.sql が作る SYSTEM_ADMIN。ここでは新規作成しない。 */
export const SEEDED_SYSTEM_ADMIN_EMAIL = "sysadmin.fictional@example.test";

/**
 * Magic Link ライフサイクル / signout 契約 E2E（AUTH-E2E-06）専用の架空ユーザー。
 * seed.sql が GoTrue 正規ユーザーとして作成する（system_role なし・所属なし）。
 *
 * **この email を storageState fixture と共有してはならない。**
 * `/auth/signout` は `supabase.auth.signOut()` を既定オプション（scope: "global"）で
 * 呼ぶため、そのユーザーの全セッションが GoTrue 側で失効する。fixture と共有すると
 * auth-setup が発行済みの storageState まで巻き添えで無効化される。
 */
export const MAGIC_LINK_LIFECYCLE_EMAIL =
  "magiclink-lifecycle.fictional@example.test";

export const FIXTURES: readonly FixtureIdentity[] = [
  {
    key: "systemAdmin",
    email: SEEDED_SYSTEM_ADMIN_EMAIL,
    systemRole: "SYSTEM_ADMIN",
    org: null,
    orgRole: null,
    state: "none",
    seeded: true,
    needsSession: true,
    purpose:
      "SYSTEM_ADMIN 境界（/system-console 許可・/cases は所属が無いので不可）",
  },
  {
    key: "orgAAdmin",
    email: "e2e.org-a-admin@example.test",
    systemRole: null,
    org: "A",
    orgRole: "ORGANIZATION_ADMIN",
    state: "active",
    seeded: false,
    needsSession: true,
    purpose: "法人 A の管理者。正常系 + SYSTEM_ADMIN 領域からの締め出し確認",
  },
  {
    key: "orgAMember",
    email: "e2e.org-a-member@example.test",
    systemRole: null,
    org: "A",
    orgRole: "SALES_USER",
    state: "active",
    seeded: false,
    needsSession: true,
    purpose: "法人 A の一般メンバー。正常系 + ロール別拒否 + 他法人 ID 拒否",
  },
  {
    key: "orgBAdmin",
    email: "e2e.org-b-admin@example.test",
    systemRole: null,
    org: "B",
    orgRole: "ORGANIZATION_ADMIN",
    state: "active",
    seeded: false,
    needsSession: true,
    purpose: "法人 B の管理者。テナント境界の対向側（法人 A の情報が出ないこと）",
  },
  {
    key: "orgBInvitee",
    email: "e2e.org-b-invitee@example.test",
    systemRole: null,
    org: "B",
    orgRole: "SALES_USER",
    state: "invited",
    seeded: false,
    needsSession: true,
    purpose:
      "他法人 ID 拒否テストの標的。法人 A のユーザーがこの membership ID を詐称しても受諾されないこと",
  },
  {
    key: "invited",
    email: "e2e.invited@example.test",
    systemRole: null,
    org: "A",
    orgRole: "SALES_USER",
    state: "invited",
    seeded: false,
    needsSession: true,
    purpose: "invited 状態の拒否（/cases 不可・/pending-invitation のみ）+ IDOR 実行者",
  },
  {
    key: "suspended",
    email: "e2e.suspended@example.test",
    systemRole: null,
    org: "A",
    orgRole: "SALES_USER",
    state: "suspended",
    seeded: false,
    needsSession: true,
    purpose: "suspended 状態の拒否（/cases 不可・/no-access）",
  },
  {
    key: "left",
    email: "e2e.left@example.test",
    systemRole: null,
    org: "A",
    orgRole: "SALES_USER",
    state: "left",
    seeded: false,
    needsSession: true,
    purpose: "left 状態の拒否（/cases 不可・/no-access）",
  },
];

/**
 * 分離の回帰ガード: signout（global scope）を実行する lifecycle 用ユーザーが
 * storageState fixture と同一になっていないことを import 時に検証する。
 * 将来 FIXTURES へ同じ email を足した場合、原因不明の timeout ではなく即座に失敗させる。
 */
{
  const shared = FIXTURES.filter((f) => f.email === MAGIC_LINK_LIFECYCLE_EMAIL);
  if (shared.length > 0) {
    throw new Error(
      "e2e fixture separation violated: MAGIC_LINK_LIFECYCLE_EMAIL is also used by " +
        `fixture(s) [${shared.map((f) => f.key).join(", ")}]. ` +
        "signout uses global scope and would revoke that fixture's storageState.",
    );
  }
}

export function fixtureByKey(key: FixtureKey): FixtureIdentity {
  const found = FIXTURES.find((f) => f.key === key);
  if (!found) throw new Error(`unknown e2e fixture key: ${key}`);
  return found;
}

/** storageState の保存先ディレクトリ（app/.auth。Git 管理対象外）。 */
export const AUTH_STATE_DIR = resolve(__dirname, "..", "..", ".auth");

export function storageStatePath(key: FixtureKey): string {
  return resolve(AUTH_STATE_DIR, `${key}.json`);
}

/** setup が書き出す実行時マニフェスト（法人 ID / membership ID）。 */
export const FIXTURE_MANIFEST_PATH = resolve(AUTH_STATE_DIR, "fixtures.json");

export interface FixtureManifest {
  readonly organizationIds: Record<OrgKey, string>;
  readonly organizationNames: Record<OrgKey, string>;
  /** fixture key -> membership UUID（state === "none" のものは含まない） */
  readonly membershipIds: Partial<Record<FixtureKey, string>>;
}
