import { test } from "vitest";
import assert from "node:assert/strict";
import { toSafePartnerLoanError } from "./errors";

test("P2B-UNIT-ERR-01: maps partner-loan tokens to safe codes", () => {
  assert.equal(
    toSafePartnerLoanError("ERROR: partner_loan_version_conflict"),
    "partner_loan_version_conflict",
  );
  assert.equal(
    toSafePartnerLoanError("ERROR: partner_loan_invalid_url"),
    "partner_loan_invalid_url",
  );
  assert.equal(
    toSafePartnerLoanError("ERROR: partner_loan_not_found"),
    "partner_loan_not_found",
  );
  assert.equal(toSafePartnerLoanError("ERROR: not_authorized"), "not_authorized");
  assert.equal(toSafePartnerLoanError("ERROR: validation_error"), "validation_error");
});

test("P2B-UNIT-ERR-02: duplicate key and unknown internals do not leak", () => {
  assert.equal(
    toSafePartnerLoanError('duplicate key value violates unique constraint "org_partner_loans_org_key_uniq"'),
    "partner_loan_duplicate_key",
  );
  assert.equal(toSafePartnerLoanError("SQLSTATE 42P01 relation does not exist"), "unexpected_error");
  assert.equal(toSafePartnerLoanError(null), "unexpected_error");
});
