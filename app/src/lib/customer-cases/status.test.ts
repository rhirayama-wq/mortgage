import { test } from "vitest";
import assert from "node:assert/strict";
import {
  CUSTOMER_CASE_STATUSES,
  customerCaseTransitionAllowed,
  isCustomerCaseStatus,
} from "./status";
import { classifyCustomerCaseError } from "./errors";

test("P2A-UNIT-01: allowed customer-case transitions match the DB rule", () => {
  assert.equal(customerCaseTransitionAllowed("draft", "invited"), true);
  assert.equal(customerCaseTransitionAllowed("invited", "opened"), true);
  assert.equal(customerCaseTransitionAllowed("opened", "inputting"), true);
  assert.equal(customerCaseTransitionAllowed("invited", "expired"), true);
  for (const from of ["draft", "invited", "opened", "inputting"] as const) {
    assert.equal(customerCaseTransitionAllowed(from, "cancelled"), true);
  }
});

test("P2A-UNIT-02: undefined / terminal transitions are rejected", () => {
  assert.equal(customerCaseTransitionAllowed("opened", "draft"), false);
  assert.equal(customerCaseTransitionAllowed("draft", "opened"), false);
  assert.equal(customerCaseTransitionAllowed("cancelled", "invited"), false);
  assert.equal(customerCaseTransitionAllowed("expired", "invited"), false);
  assert.equal(customerCaseTransitionAllowed("inputting", "opened"), false);
});

test("P2A-UNIT-03: status guard and error classifier", () => {
  assert.equal(isCustomerCaseStatus("draft"), true);
  assert.equal(isCustomerCaseStatus("assessed"), false); // 将来状態は未追加
  assert.equal(CUSTOMER_CASE_STATUSES.length, 6);
  assert.equal(
    classifyCustomerCaseError("ERROR: not_authorized"),
    "not_authorized",
  );
  assert.equal(classifyCustomerCaseError("weird internal detail"), "unexpected_error");
  assert.equal(classifyCustomerCaseError(null), "unexpected_error");
});
