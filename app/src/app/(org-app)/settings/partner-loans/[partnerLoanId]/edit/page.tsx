/**
 * /settings/partner-loans/[partnerLoanId]/edit — 提携ローン編集（ORGANIZATION_ADMIN）。
 * 現在の version を初期値として読み込み、送信で「新しい version」を append 作成する
 * （既存 version は上書きしない）。expectedVersionId により version 競合を検知する。
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireOrgAccess, orErrorPage } from "@/lib/auth/require";
import { isUuid } from "@/lib/auth/validators";
import { loadPartnerLoanDetail } from "@/lib/partner-loans/queries";
import type { PartnerLoanFormValues } from "@/lib/partner-loans/validation";
import {
  PartnerLoanForm,
  EMPTY_PARTNER_LOAN_FORM,
} from "../../partner-loan-form";
import { updatePartnerLoan } from "../../actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ partnerLoanId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const pct = (bps: number | null): string => (bps === null ? "" : String(bps / 100));
const yen = (v: number | null): string => (v === null ? "" : String(v));

export default async function EditPartnerLoanPage({ params, searchParams }: PageProps) {
  const { role } = await requireOrgAccess();
  if (role !== "ORGANIZATION_ADMIN") redirect("/settings/partner-loans");

  const { partnerLoanId } = await params;
  if (!isUuid(partnerLoanId)) notFound();
  const detail = await orErrorPage(() => loadPartnerLoanDetail(partnerLoanId));
  if (!detail) notFound();

  const v = detail.versions.find((x) => x.id === detail.currentVersionId);

  const defaults: PartnerLoanFormValues = v
    ? {
        ...EMPTY_PARTNER_LOAN_FORM,
        institutionName: detail.institutionName,
        displayName: detail.displayName,
        productName: v.productName,
        productType: v.productType ?? "",
        description: v.description ?? "",
        interestRateType: v.interestRateType,
        baseRatePercent: pct(v.baseRateBps),
        preferentialRatePercent: pct(v.preferentialRateReductionBps),
        indicativeRatePercent: pct(v.indicativeRateBps),
        minLoanAmountYen: yen(v.minimumLoanAmountYen),
        maxLoanAmountYen: yen(v.maximumLoanAmountYen),
        minTermYears: v.minimumTermYears === null ? "" : String(v.minimumTermYears),
        maxTermYears: v.maximumTermYears === null ? "" : String(v.maximumTermYears),
        maxLtvPercent: pct(v.maximumLtvBps),
        handlingFeeType: v.handlingFeeType ?? "",
        handlingFeeYen: yen(v.handlingFeeYen),
        handlingFeePercent: pct(v.handlingFeeBps),
        guaranteeFeeDescription: v.guaranteeFeeDescription ?? "",
        otherFeesDescription: v.otherFeesDescription ?? "",
        propertyTypes: v.eligiblePropertyTypes,
        eligibleAreas: v.eligibleAreas.join(", "),
        minAnnualIncomeYen: yen(v.minimumAnnualIncomeYen),
        minEmploymentMonths:
          v.minimumEmploymentMonths === null ? "" : String(v.minimumEmploymentMonths),
        employmentTypes: v.eligibleEmploymentTypes,
        minAge: v.minimumAge === null ? "" : String(v.minimumAge),
        maxApplicationAge:
          v.maximumApplicationAge === null ? "" : String(v.maximumApplicationAge),
        maxAgeAtMaturity:
          v.maximumAgeAtMaturity === null ? "" : String(v.maximumAgeAtMaturity),
        groupCreditLifeInsuranceSummary: v.groupCreditLifeInsuranceSummary ?? "",
        customerDisclosure: v.customerDisclosure ?? "",
        internalUnderwritingNotes: v.internalUnderwritingNotes ?? "",
        applicationUrl: v.applicationUrl ?? "",
        externalProductKey: v.externalProductKey ?? "",
        inquiryContact: v.inquiryContact ?? "",
        validFrom: v.validFrom ?? "",
        validUntil: v.validUntil ?? "",
        confirmedAt: "",
      }
    : { ...EMPTY_PARTNER_LOAN_FORM, institutionName: detail.institutionName, displayName: detail.displayName };

  const sp = await searchParams;
  const errKey = typeof sp.e === "string" ? sp.e : "";
  const errorMessage =
    errKey === "validation"
      ? "入力内容をご確認ください（金利・金額・期間・URL などの形式）。"
      : errKey === "save"
        ? "更新できませんでした。時間をおいて再度お試しください。"
        : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">提携ローンを編集</h1>
        <Link
          href={`/settings/partner-loans/${detail.id}`}
          className="text-sm text-slate-600 hover:underline"
        >
          詳細へ戻る
        </Link>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        保存すると新しいバージョンが作成されます。過去のバージョンは保持され、診断の再現に利用できます。
      </p>
      <PartnerLoanForm
        action={updatePartnerLoan}
        submitLabel="新しいバージョンを保存"
        mode="edit"
        partnerLoanId={detail.id}
        expectedVersionId={detail.currentVersionId}
        defaults={defaults}
        errorMessage={errorMessage}
      />
    </div>
  );
}
