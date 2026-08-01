import { test } from "vitest";
import assert from "node:assert/strict";
import {
  classifyCustomerCaseError,
  toSafeCaseError,
} from "./errors";

test("P2A2-UNIT-ERR-01: classify maps known DB tokens, unknown -> unexpected_error", () => {
  assert.equal(classifyCustomerCaseError("ERROR: not_authorized"), "not_authorized");
  assert.equal(
    classifyCustomerCaseError("ERROR: customer_case_not_inputtable detail"),
    "customer_case_not_inputtable",
  );
  assert.equal(classifyCustomerCaseError("weird internal detail"), "unexpected_error");
  assert.equal(classifyCustomerCaseError(null), "unexpected_error");
});

test("P2A2-UNIT-ERR-02: toSafeCaseError never leaks internal tokens", () => {
  assert.equal(toSafeCaseError("ERROR: not_authorized"), "not_authorized");
  assert.equal(toSafeCaseError("ERROR: invite_email_mismatch"), "invitation_email_mismatch");
  assert.equal(toSafeCaseError("ERROR: invitation_expired"), "invitation_expired");
  assert.equal(toSafeCaseError("ERROR: invitation_not_open"), "invitation_already_accepted");
  assert.equal(
    toSafeCaseError("ERROR: primary_applicant_already_exists"),
    "duplicate_active_invitation",
  );
  assert.equal(toSafeCaseError("ERROR: customer_case_not_found"), "not_found");
  assert.equal(toSafeCaseError("ERROR: invalid_profile_email"), "validation_error");
  assert.equal(toSafeCaseError("ERROR: applicant_not_active"), "validation_error");
  assert.equal(toSafeCaseError("some raw sqlstate 23505"), "unexpected_error");
});
