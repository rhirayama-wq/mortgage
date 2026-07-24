import { test } from "vitest";
import assert from "node:assert/strict";
import { parseLoginOtpType, ALLOWED_LOGIN_OTP_TYPES } from "./otp";

test("AUTH-07a: allows only email / magiclink for login callback", () => {
  assert.equal(parseLoginOtpType("email"), "email");
  assert.equal(parseLoginOtpType("magiclink"), "magiclink");
});

test("AUTH-07b: rejects recovery / invite / signup and unknown types", () => {
  assert.equal(parseLoginOtpType("recovery"), null);
  assert.equal(parseLoginOtpType("invite"), null);
  assert.equal(parseLoginOtpType("signup"), null);
  assert.equal(parseLoginOtpType("email_change"), null);
  assert.equal(parseLoginOtpType("sms"), null);
  assert.equal(parseLoginOtpType(""), null);
  assert.equal(parseLoginOtpType(null), null);
  assert.equal(parseLoginOtpType(undefined), null);
  assert.equal(parseLoginOtpType(["email"]), null);
});

test("AUTH-07c: allowed list is exactly email + magiclink", () => {
  assert.deepEqual([...ALLOWED_LOGIN_OTP_TYPES], ["email", "magiclink"]);
});
