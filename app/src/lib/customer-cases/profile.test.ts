import { test } from "vitest";
import assert from "node:assert/strict";
import {
  EMPTY_BASIC_PROFILE,
  validateBasicProfile,
  toBasicProfileInput,
  isBasicProfileStarted,
  type BasicApplicantProfileInput,
} from "./profile";

const base = (
  over: Partial<BasicApplicantProfileInput> = {},
): BasicApplicantProfileInput => ({ ...EMPTY_BASIC_PROFILE, ...over });

test("P2A2-UNIT-01: empty and well-formed inputs have no validation errors", () => {
  assert.deepEqual(validateBasicProfile(EMPTY_BASIC_PROFILE), []);
  assert.deepEqual(
    validateBasicProfile(
      base({
        fullName: "架空 太郎",
        fullNameKana: "カクウ タロウ",
        birthDate: "1990-01-01",
        email: "taro@example.test",
        phone: "09000000000",
        postalCode: "1000001",
        address: "東京都（架空）1-2-3",
      }),
    ),
    [],
  );
});

test("P2A2-UNIT-02: malformed email / birth_date are rejected by field name (no PII value)", () => {
  assert.deepEqual(validateBasicProfile(base({ email: "not-an-email" })), ["email"]);
  assert.deepEqual(validateBasicProfile(base({ birthDate: "2999-01-01" })), [
    "birth_date",
  ]);
  assert.deepEqual(validateBasicProfile(base({ birthDate: "1990/01/01" })), [
    "birth_date",
  ]);
  assert.deepEqual(validateBasicProfile(base({ birthDate: "1800-01-01" })), [
    "birth_date",
  ]);
});

test("P2A2-UNIT-03: length limits are enforced per field", () => {
  assert.deepEqual(validateBasicProfile(base({ fullName: "あ".repeat(201) })), [
    "full_name",
  ]);
  assert.deepEqual(validateBasicProfile(base({ phone: "9".repeat(51) })), [
    "phone",
  ]);
  assert.deepEqual(validateBasicProfile(base({ postalCode: "1".repeat(21) })), [
    "postal_code",
  ]);
  assert.deepEqual(validateBasicProfile(base({ address: "x".repeat(501) })), [
    "address",
  ]);
});

test("P2A2-UNIT-04: DB row mapping and started detection", () => {
  assert.deepEqual(toBasicProfileInput(null), EMPTY_BASIC_PROFILE);
  assert.deepEqual(
    toBasicProfileInput({
      full_name: "架空 太郎",
      full_name_kana: null,
      birth_date: "1990-01-01",
      email: null,
      phone: null,
      postal_code: null,
      address: null,
    }),
    base({ fullName: "架空 太郎", birthDate: "1990-01-01" }),
  );
  assert.equal(isBasicProfileStarted(EMPTY_BASIC_PROFILE), false);
  assert.equal(isBasicProfileStarted(base({ fullName: "架空 太郎" })), true);
});
