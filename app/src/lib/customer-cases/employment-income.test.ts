import { test } from "vitest";
import assert from "node:assert/strict";
import {
  EMPTY_EMPLOYMENT_INCOME,
  validateEmploymentIncome,
  toEmploymentIncomeInput,
  isEmploymentIncomeStarted,
  toEmploymentIncomeRpcArgs,
  missingFieldLabels,
  employmentIncomeProgressLabel,
  isEmploymentType,
  isIncomeType,
  type EmploymentIncomeInput,
} from "./employment-income";

const base = (
  over: Partial<EmploymentIncomeInput> = {},
): EmploymentIncomeInput => ({ ...EMPTY_EMPLOYMENT_INCOME, ...over });

test("P2A3-UNIT-01: empty and well-formed inputs have no validation errors", () => {
  assert.deepEqual(validateEmploymentIncome(EMPTY_EMPLOYMENT_INCOME), []);
  assert.deepEqual(
    validateEmploymentIncome(
      base({
        employerName: "架空商事株式会社",
        employmentType: "full_time",
        employmentStartedOn: "2018-04",
        annualGrossIncomeYen: "6000000",
        incomeType: "salary",
      }),
    ),
    [],
  );
});

test("P2A3-UNIT-02: enum membership is validated by field name (no value)", () => {
  assert.deepEqual(validateEmploymentIncome(base({ employmentType: "director" })), [
    "employment_type",
  ]);
  assert.deepEqual(validateEmploymentIncome(base({ incomeType: "dividend" })), [
    "income_type",
  ]);
  // 空欄は途中保存として許容
  assert.deepEqual(validateEmploymentIncome(base({ employmentType: "" })), []);
});

test("P2A3-UNIT-03: employment_started_on must be YYYY-MM, not future, >= 1900", () => {
  assert.deepEqual(validateEmploymentIncome(base({ employmentStartedOn: "2018-04" })), []);
  assert.deepEqual(validateEmploymentIncome(base({ employmentStartedOn: "2018-4" })), [
    "employment_started_on",
  ]);
  assert.deepEqual(validateEmploymentIncome(base({ employmentStartedOn: "2018-13" })), [
    "employment_started_on",
  ]);
  assert.deepEqual(validateEmploymentIncome(base({ employmentStartedOn: "1899-12" })), [
    "employment_started_on",
  ]);
  assert.deepEqual(validateEmploymentIncome(base({ employmentStartedOn: "2999-01" })), [
    "employment_started_on",
  ]);
  // 日精度は不可（月精度のみ）
  assert.deepEqual(
    validateEmploymentIncome(base({ employmentStartedOn: "2018-04-01" })),
    ["employment_started_on"],
  );
});

test("P2A3-UNIT-04: annual income must be a non-negative integer within range", () => {
  assert.deepEqual(validateEmploymentIncome(base({ annualGrossIncomeYen: "0" })), []);
  assert.deepEqual(validateEmploymentIncome(base({ annualGrossIncomeYen: "6000000" })), []);
  assert.deepEqual(validateEmploymentIncome(base({ annualGrossIncomeYen: "-1" })), [
    "annual_gross_income_yen",
  ]);
  assert.deepEqual(validateEmploymentIncome(base({ annualGrossIncomeYen: "1.5" })), [
    "annual_gross_income_yen",
  ]);
  assert.deepEqual(validateEmploymentIncome(base({ annualGrossIncomeYen: "6,000,000" })), [
    "annual_gross_income_yen",
  ]);
  assert.deepEqual(
    validateEmploymentIncome(base({ annualGrossIncomeYen: "99999999999999" })),
    ["annual_gross_income_yen"],
  );
});

test("P2A3-UNIT-05: employer_name length limit is enforced", () => {
  assert.deepEqual(validateEmploymentIncome(base({ employerName: "あ".repeat(200) })), []);
  assert.deepEqual(validateEmploymentIncome(base({ employerName: "あ".repeat(201) })), [
    "employer_name",
  ]);
});

test("P2A3-UNIT-06: validation NEVER enforces the employment-type conditional required rule", () => {
  // full_time で他項目が空でも「形式検証」は通す（完了判定は DB 純粋関数が唯一の正）。
  assert.deepEqual(
    validateEmploymentIncome(base({ employmentType: "full_time" })),
    [],
  );
  // unemployed でも同様（TS は complete を判定しない）。
  assert.deepEqual(validateEmploymentIncome(base({ employmentType: "unemployed" })), []);
});

test("P2A3-UNIT-07: DB row mapping (date -> month, bigint -> string) and started detection", () => {
  assert.deepEqual(toEmploymentIncomeInput(null), EMPTY_EMPLOYMENT_INCOME);
  assert.deepEqual(
    toEmploymentIncomeInput({
      employer_name: "架空商事株式会社",
      employment_type: "full_time",
      employment_started_on: "2018-04-01",
      annual_gross_income_yen: 6000000,
      income_type: "salary",
    }),
    base({
      employerName: "架空商事株式会社",
      employmentType: "full_time",
      employmentStartedOn: "2018-04",
      annualGrossIncomeYen: "6000000",
      incomeType: "salary",
    }),
  );
  assert.equal(isEmploymentIncomeStarted(EMPTY_EMPLOYMENT_INCOME), false);
  assert.equal(isEmploymentIncomeStarted(base({ employmentType: "full_time" })), true);
});

test("P2A3-UNIT-08: RPC args convert YYYY-MM -> YYYY-MM-01 and income -> number|null", () => {
  assert.deepEqual(
    toEmploymentIncomeRpcArgs(
      base({
        employerName: "架空商事株式会社",
        employmentType: "full_time",
        employmentStartedOn: "2018-04",
        annualGrossIncomeYen: "6000000",
        incomeType: "salary",
      }),
    ),
    {
      employerName: "架空商事株式会社",
      employmentType: "full_time",
      employmentStartedOn: "2018-04-01",
      annualGrossIncomeYen: 6000000,
      incomeType: "salary",
    },
  );
  assert.deepEqual(toEmploymentIncomeRpcArgs(EMPTY_EMPLOYMENT_INCOME), {
    employerName: null,
    employmentType: null,
    employmentStartedOn: null,
    annualGrossIncomeYen: null,
    incomeType: null,
  });
});

test("P2A3-UNIT-09: missing-field labels map DB codes to Japanese, ignore unknowns", () => {
  assert.deepEqual(missingFieldLabels(["employer_name", "income_type"]), [
    "勤務先名",
    "収入区分",
  ]);
  assert.deepEqual(missingFieldLabels(["bogus"]), []);
  assert.deepEqual(missingFieldLabels(null), []);
});

test("P2A3-UNIT-10: enum type guards", () => {
  assert.equal(isEmploymentType("full_time"), true);
  assert.equal(isEmploymentType("director"), false);
  assert.equal(isIncomeType("salary"), true);
  assert.equal(isIncomeType("dividend"), false);
});

test("P2A3-UNIT-11: staff progress label (values never involved)", () => {
  assert.equal(employmentIncomeProgressLabel(false, false), "未入力");
  assert.equal(employmentIncomeProgressLabel(true, false), "入力中");
  assert.equal(employmentIncomeProgressLabel(true, true), "完了");
  // complete が true なら started の値に関わらず「完了」
  assert.equal(employmentIncomeProgressLabel(false, true), "完了");
});
