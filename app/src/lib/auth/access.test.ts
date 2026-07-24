import { test } from "vitest";
import assert from "node:assert/strict";
import {
  decideLanding,
  routeForDecision,
  canAccessOrgApp,
  canAccessSystemConsole,
  canAccessPendingInvitation,
  type AccessContext,
} from "./access";
import type { MembershipRow, ProfileRow } from "./validators";

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    email: "user@example.test",
    displayName: null,
    systemRole: null,
    ...overrides,
  };
}

function membership(overrides: Partial<MembershipRow> = {}): MembershipRow {
  return {
    membershipId: "00000000-0000-4000-8000-000000000011",
    organizationId: "00000000-0000-4000-8000-000000000012",
    organizationName: "Fictional Org (test only)",
    role: "SALES_USER",
    status: "active",
    invitedEmail: "user@example.test",
    ...overrides,
  };
}

function ctx(
  memberships: MembershipRow[],
  profileOverrides: Partial<ProfileRow> = {},
): AccessContext {
  return { profile: profile(profileOverrides), memberships };
}

test("AUTH-13a: active membership -> org-app", () => {
  const d = decideLanding(ctx([membership()]));
  assert.deepEqual(d, {
    kind: "org-app",
    organizationId: "00000000-0000-4000-8000-000000000012",
  });
  assert.equal(routeForDecision(d), "/cases");
});

test("AUTH-13b: SYSTEM_ADMIN alone -> system console, never org-app", () => {
  const c = ctx([], { systemRole: "SYSTEM_ADMIN" });
  assert.deepEqual(decideLanding(c), { kind: "system-console" });
  assert.equal(canAccessOrgApp(c), false);
  assert.equal(canAccessSystemConsole(c), true);
});

test("AUTH-13c: SYSTEM_ADMIN takes priority even with active membership (U3)", () => {
  const c = ctx([membership()], { systemRole: "SYSTEM_ADMIN" });
  assert.deepEqual(decideLanding(c), { kind: "system-console" });
  // ただし法人アプリ自体へのアクセス権は active membership に従う
  assert.equal(canAccessOrgApp(c), true);
});

test("AUTH-12a: invited only -> pending-invitation", () => {
  const c = ctx([membership({ status: "invited" })]);
  assert.deepEqual(decideLanding(c), { kind: "pending-invitation" });
  assert.equal(canAccessOrgApp(c), false);
  assert.equal(canAccessPendingInvitation(c), true);
});

test("AUTH-12b: no membership -> no-access", () => {
  const c = ctx([]);
  assert.deepEqual(decideLanding(c), { kind: "no-access" });
  assert.equal(canAccessOrgApp(c), false);
  assert.equal(canAccessSystemConsole(c), false);
  assert.equal(canAccessPendingInvitation(c), false);
});

test("AUTH-12c: suspended only -> no-access (法人アプリ拒否)", () => {
  const c = ctx([membership({ status: "suspended" })]);
  assert.deepEqual(decideLanding(c), { kind: "no-access" });
  assert.equal(canAccessOrgApp(c), false);
});

test("AUTH-12d: left only -> no-access", () => {
  const c = ctx([membership({ status: "left" })]);
  assert.deepEqual(decideLanding(c), { kind: "no-access" });
});

test("AUTH-12e: suspended + invited -> pending-invitation (受諾は可能)", () => {
  const c = ctx([
    membership({ status: "suspended" }),
    membership({
      membershipId: "00000000-0000-4000-8000-000000000013",
      organizationId: "00000000-0000-4000-8000-000000000014",
      status: "invited",
    }),
  ]);
  assert.deepEqual(decideLanding(c), { kind: "pending-invitation" });
});

test("AUTH-20a: multiple active orgs -> deterministic first by name (U2 暫定)", () => {
  const c = ctx([
    membership({
      membershipId: "00000000-0000-4000-8000-000000000021",
      organizationId: "00000000-0000-4000-8000-000000000022",
      organizationName: "Org B fictional",
    }),
    membership({
      membershipId: "00000000-0000-4000-8000-000000000023",
      organizationId: "00000000-0000-4000-8000-000000000024",
      organizationName: "Org A fictional",
    }),
  ]);
  const d = decideLanding(c);
  assert.deepEqual(d, {
    kind: "org-app",
    organizationId: "00000000-0000-4000-8000-000000000024",
  });
});

test("AUTH-20b: active + invited -> org-app (招待はアプリ内で通知)", () => {
  const c = ctx([
    membership(),
    membership({
      membershipId: "00000000-0000-4000-8000-000000000031",
      organizationId: "00000000-0000-4000-8000-000000000032",
      status: "invited",
    }),
  ]);
  assert.equal(decideLanding(c).kind, "org-app");
  assert.equal(canAccessPendingInvitation(c), true);
});

test("routeForDecision covers all kinds", () => {
  assert.equal(routeForDecision({ kind: "system-console" }), "/system-console");
  assert.equal(
    routeForDecision({ kind: "org-app", organizationId: "x" }),
    "/cases",
  );
  assert.equal(
    routeForDecision({ kind: "pending-invitation" }),
    "/pending-invitation",
  );
  assert.equal(routeForDecision({ kind: "no-access" }), "/no-access");
});
