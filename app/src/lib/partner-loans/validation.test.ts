import { test } from "vitest";
import assert from "node:assert/strict";
import { validatePartnerLoanForm, type PartnerLoanFormValues } from "./validation";

const EMPTY: PartnerLoanFormValues = {
  institutionName: "",
  displayName: "",
  productName: "",
  productType: "",
  description: "",
  interestRateType: "variable",
  baseRatePercent: "",
  preferentialRatePercent: "",
  indicativeRatePercent: "",
  minLoanAmountYen: "",
  maxLoanAmountYen: "",
  minTermYears: "",
  maxTermYears: "",
  maxLtvPercent: "",
  handlingFeeType: "",
  handlingFeeYen: "",
  handlingFeePercent: "",
  guaranteeFeeDescription: "",
  otherFeesDescription: "",
  propertyTypes: [],
  eligibleAreas: "",
  minAnnualIncomeYen: "",
  minEmploymentMonths: "",
  employmentTypes: [],
  minAge: "",
  maxApplicationAge: "",
  maxAgeAtMaturity: "",
  groupCreditLifeInsuranceSummary: "",
  customerDisclosure: "",
  internalUnderwritingNotes: "",
  applicationUrl: "",
  externalProductKey: "",
  inquiryContact: "",
  validFrom: "",
  validUntil: "",
  confirmedAt: "",
};

const base = (o: Partial<PartnerLoanFormValues> = {}): PartnerLoanFormValues => ({
  ...EMPTY,
  institutionName: "架空信用金庫",
  displayName: "架空 提携ローン",
  productName: "架空 商品",
  interestRateType: "fixed",
  ...o,
});

test("P2B-UNIT-01: valid input yields payload with bps/yen conversion", () => {
  const r = validatePartnerLoanForm(
    base({
      baseRatePercent: "1.25",
      maxLtvPercent: "80",
      minLoanAmountYen: "1000000",
      maxLoanAmountYen: "100000000",
      propertyTypes: ["new", "condo", "bogus"],
      employmentTypes: ["full_time"],
      applicationUrl: "https://apply.example.test/a",
    }),
  );
  assert.deepEqual(r.errors, []);
  assert.ok(r.version);
  assert.equal(r.version!.base_rate_bps, 125);
  assert.equal(r.version!.maximum_ltv_bps, 8000);
  assert.deepEqual(r.version!.eligible_property_types, ["new", "condo"]); // bogus filtered
  assert.equal(r.version!.product_name, "架空 商品");
});

test("P2B-UNIT-02: required fields flagged", () => {
  const r = validatePartnerLoanForm(EMPTY);
  assert.ok(r.errors.includes("institution_name"));
  assert.ok(r.errors.includes("display_name"));
  assert.ok(r.errors.includes("product_name"));
  assert.equal(r.version, null);
});

test("P2B-UNIT-03: amount / term / period ranges", () => {
  const amt = validatePartnerLoanForm(
    base({ minLoanAmountYen: "200", maxLoanAmountYen: "100" }),
  );
  assert.ok(amt.errors.includes("amount_range"));

  const term = validatePartnerLoanForm(
    base({ minTermYears: "40", maxTermYears: "35" }),
  );
  assert.ok(term.errors.includes("term_range"));

  const period = validatePartnerLoanForm(
    base({ validFrom: "2026-12-01", validUntil: "2026-01-01" }),
  );
  assert.ok(period.errors.includes("valid_period"));
});

test("P2B-UNIT-04: rate bounds and URL scheme", () => {
  const rate = validatePartnerLoanForm(base({ baseRatePercent: "-1" }));
  assert.ok(rate.errors.includes("base_rate"));

  const url = validatePartnerLoanForm(
    base({ applicationUrl: "http://insecure.example.test" }),
  );
  assert.ok(url.errors.includes("application_url"));
});
