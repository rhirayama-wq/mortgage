/**
 * Phase 2A-2b: FormData → PartnerLoanFormValues の変換（Server Action 用）。
 * 値の検証・正規化は validation.ts が行う（ここは形の詰め替えのみ）。
 */

import type { PartnerLoanFormValues } from "./validation";

const s = (fd: FormData, key: string): string => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};
const list = (fd: FormData, key: string): string[] =>
  fd.getAll(key).filter((v): v is string => typeof v === "string");

export function partnerLoanFormValues(fd: FormData): PartnerLoanFormValues {
  return {
    institutionName: s(fd, "institutionName"),
    displayName: s(fd, "displayName"),
    productName: s(fd, "productName"),
    productType: s(fd, "productType"),
    description: s(fd, "description"),
    interestRateType: s(fd, "interestRateType"),
    baseRatePercent: s(fd, "baseRatePercent"),
    preferentialRatePercent: s(fd, "preferentialRatePercent"),
    indicativeRatePercent: s(fd, "indicativeRatePercent"),
    minLoanAmountYen: s(fd, "minLoanAmountYen"),
    maxLoanAmountYen: s(fd, "maxLoanAmountYen"),
    minTermYears: s(fd, "minTermYears"),
    maxTermYears: s(fd, "maxTermYears"),
    maxLtvPercent: s(fd, "maxLtvPercent"),
    handlingFeeType: s(fd, "handlingFeeType"),
    handlingFeeYen: s(fd, "handlingFeeYen"),
    handlingFeePercent: s(fd, "handlingFeePercent"),
    guaranteeFeeDescription: s(fd, "guaranteeFeeDescription"),
    otherFeesDescription: s(fd, "otherFeesDescription"),
    propertyTypes: list(fd, "propertyTypes"),
    eligibleAreas: s(fd, "eligibleAreas"),
    minAnnualIncomeYen: s(fd, "minAnnualIncomeYen"),
    minEmploymentMonths: s(fd, "minEmploymentMonths"),
    employmentTypes: list(fd, "employmentTypes"),
    minAge: s(fd, "minAge"),
    maxApplicationAge: s(fd, "maxApplicationAge"),
    maxAgeAtMaturity: s(fd, "maxAgeAtMaturity"),
    groupCreditLifeInsuranceSummary: s(fd, "groupCreditLifeInsuranceSummary"),
    customerDisclosure: s(fd, "customerDisclosure"),
    internalUnderwritingNotes: s(fd, "internalUnderwritingNotes"),
    applicationUrl: s(fd, "applicationUrl"),
    externalProductKey: s(fd, "externalProductKey"),
    inquiryContact: s(fd, "inquiryContact"),
    validFrom: s(fd, "validFrom"),
    validUntil: s(fd, "validUntil"),
    confirmedAt: s(fd, "confirmedAt"),
  };
}
