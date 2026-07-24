import { test } from "vitest";
import assert from "node:assert/strict";
import {
  normalizeEmail,
  isValidEmail,
  isUuid,
  parseSystemRole,
  parseOrganizationRole,
  parseMembershipStatus,
  parseMembershipRow,
  parseProfileRow,
  ValidationError,
} from "./validators";

test("AUTH-02a: normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  User@Example.TEST  "), "user@example.test");
  assert.equal(normalizeEmail(null), "");
  assert.equal(normalizeEmail(42), "");
});

test("AUTH-02b: isValidEmail accepts plausible emails", () => {
  assert.equal(isValidEmail("user@example.test"), true);
  assert.equal(isValidEmail("a.b+c@sub.example.test"), true);
});

test("AUTH-02c: isValidEmail rejects invalid input", () => {
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail("not-an-email"), false);
  assert.equal(isValidEmail("a@b"), false);
  assert.equal(isValidEmail("a b@example.test"), false);
  assert.equal(isValidEmail("a@" + "b".repeat(260) + ".test"), false);
});

test("RUNTIME-01: isUuid", () => {
  assert.equal(isUuid("00000000-0000-4000-8000-000000000001"), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid(1), false);
});

test("RUNTIME-02: parseSystemRole validates enum + null", () => {
  assert.equal(parseSystemRole("SYSTEM_ADMIN"), "SYSTEM_ADMIN");
  assert.equal(parseSystemRole(null), null);
  assert.equal(parseSystemRole(undefined), null);
  assert.throws(() => parseSystemRole("ADMIN"), ValidationError);
  assert.throws(() => parseSystemRole("system_admin"), ValidationError);
});

test("RUNTIME-03: parseOrganizationRole rejects unknown values", () => {
  assert.equal(parseOrganizationRole("ORGANIZATION_ADMIN"), "ORGANIZATION_ADMIN");
  assert.equal(parseOrganizationRole("SALES_USER"), "SALES_USER");
  assert.throws(() => parseOrganizationRole("SYSTEM_ADMIN"), ValidationError);
  assert.throws(() => parseOrganizationRole(null), ValidationError);
});

test("RUNTIME-04: parseMembershipStatus rejects unknown values", () => {
  assert.equal(parseMembershipStatus("invited"), "invited");
  assert.equal(parseMembershipStatus("active"), "active");
  assert.equal(parseMembershipStatus("suspended"), "suspended");
  assert.equal(parseMembershipStatus("left"), "left");
  assert.throws(() => parseMembershipStatus("ACTIVE"), ValidationError);
  assert.throws(() => parseMembershipStatus(""), ValidationError);
});

const validMembership = {
  id: "00000000-0000-4000-8000-000000000011",
  organization_id: "00000000-0000-4000-8000-000000000012",
  role: "SALES_USER",
  status: "active",
  invited_email: "user@example.test",
  organizations: { name: "Fictional Org (test only)" },
};

test("RUNTIME-05: parseMembershipRow accepts valid rows", () => {
  const row = parseMembershipRow(validMembership);
  assert.equal(row.membershipId, validMembership.id);
  assert.equal(row.organizationId, validMembership.organization_id);
  assert.equal(row.role, "SALES_USER");
  assert.equal(row.status, "active");
  assert.equal(row.organizationName, "Fictional Org (test only)");
});

test("RUNTIME-06: parseMembershipRow tolerates missing joined organization", () => {
  const row = parseMembershipRow({ ...validMembership, organizations: null });
  assert.equal(row.organizationName, null);
});

test("RUNTIME-07: parseMembershipRow rejects malformed rows (fail closed)", () => {
  assert.throws(() => parseMembershipRow(null), ValidationError);
  assert.throws(() => parseMembershipRow("row"), ValidationError);
  assert.throws(
    () => parseMembershipRow({ ...validMembership, id: "x" }),
    ValidationError,
  );
  assert.throws(
    () => parseMembershipRow({ ...validMembership, role: "OWNER" }),
    ValidationError,
  );
  assert.throws(
    () => parseMembershipRow({ ...validMembership, status: "banned" }),
    ValidationError,
  );
});

test("RUNTIME-08: parseProfileRow validates and rejects", () => {
  const profile = parseProfileRow({
    id: "00000000-0000-4000-8000-000000000001",
    email: "user@example.test",
    display_name: null,
    system_role: null,
  });
  assert.equal(profile.systemRole, null);
  assert.equal(profile.displayName, null);

  assert.throws(
    () =>
      parseProfileRow({
        id: "00000000-0000-4000-8000-000000000001",
        email: "user@example.test",
        system_role: "SUPERUSER",
      }),
    ValidationError,
  );
});
