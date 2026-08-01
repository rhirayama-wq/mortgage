/**
 * 提携ローン入力フォーム（Server Component）。新規登録・編集（新 version 作成）で共用。
 * セクション単位に分割（基本情報 / 金利・費用 / 適用条件 / 管理情報）。
 * 内部審査メモは管理者向け入力であり、顧客画面には表示しない旨を明記する。
 */

import type { PartnerLoanFormValues } from "@/lib/partner-loans/validation";
import {
  INTEREST_RATE_TYPES,
  HANDLING_FEE_TYPES,
  PROPERTY_TYPES,
  EMPLOYMENT_TYPES,
} from "@/lib/partner-loans/types";
import {
  interestRateTypeLabel,
  handlingFeeTypeLabel,
  propertyTypeLabel,
  employmentTypeLabel,
} from "@/lib/partner-loans/labels";

export const EMPTY_PARTNER_LOAN_FORM: PartnerLoanFormValues = {
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

const inputClass = "rounded border border-slate-300 px-3 py-2 text-sm";
const labelClass = "flex flex-col gap-1 text-sm";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

export function PartnerLoanForm({
  action,
  submitLabel,
  defaults = EMPTY_PARTNER_LOAN_FORM,
  mode,
  partnerLoanId,
  expectedVersionId,
  errorMessage,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  defaults?: PartnerLoanFormValues;
  mode: "create" | "edit";
  partnerLoanId?: string;
  expectedVersionId?: string | null;
  errorMessage?: string;
}) {
  const d = defaults;
  return (
    <form action={action} className="flex flex-col gap-4">
      {mode === "edit" && partnerLoanId ? (
        <>
          <input type="hidden" name="partnerLoanId" value={partnerLoanId} />
          <input
            type="hidden"
            name="expectedVersionId"
            value={expectedVersionId ?? ""}
          />
          <input type="hidden" name="institutionName" value={d.institutionName} />
        </>
      ) : null}

      {errorMessage ? (
        <div
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      <Section title="基本情報">
        {mode === "create" ? (
          <label className={labelClass}>
            <span className="font-medium">金融機関名（架空）</span>
            <input
              type="text"
              name="institutionName"
              required
              maxLength={200}
              defaultValue={d.institutionName}
              placeholder="例: 架空信用金庫"
              className={inputClass}
            />
          </label>
        ) : (
          <div className="text-sm text-slate-600">
            金融機関: <span className="font-medium">{d.institutionName}</span>
          </div>
        )}
        <label className={labelClass}>
          <span className="font-medium">提携ローン名</span>
          <input
            type="text"
            name="displayName"
            required
            maxLength={200}
            defaultValue={d.displayName}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className="font-medium">商品名</span>
          <input
            type="text"
            name="productName"
            required
            maxLength={200}
            defaultValue={d.productName}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className="font-medium">商品種別（任意）</span>
          <input
            type="text"
            name="productType"
            maxLength={100}
            defaultValue={d.productType}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className="font-medium">商品説明（任意）</span>
          <textarea
            name="description"
            rows={2}
            defaultValue={d.description}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className="font-medium">問い合わせ先（任意）</span>
          <input
            type="text"
            name="inquiryContact"
            maxLength={200}
            defaultValue={d.inquiryContact}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className="font-medium">申込先 URL（https・任意）</span>
          <input
            type="url"
            name="applicationUrl"
            defaultValue={d.applicationUrl}
            placeholder="https://example.test/apply"
            className={inputClass}
          />
        </label>
      </Section>

      <Section title="金利・費用">
        <label className={labelClass}>
          <span className="font-medium">金利タイプ</span>
          <select
            name="interestRateType"
            defaultValue={d.interestRateType}
            className={inputClass}
          >
            {INTEREST_RATE_TYPES.map((t) => (
              <option key={t} value={t}>
                {interestRateTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            <span className="text-xs text-slate-500">基準金利(%)</span>
            <input type="text" name="baseRatePercent" inputMode="decimal" defaultValue={d.baseRatePercent} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">優遇幅(%)</span>
            <input type="text" name="preferentialRatePercent" inputMode="decimal" defaultValue={d.preferentialRatePercent} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">参考適用金利(%)</span>
            <input type="text" name="indicativeRatePercent" inputMode="decimal" defaultValue={d.indicativeRatePercent} className={inputClass} />
          </label>
        </div>
        <label className={labelClass}>
          <span className="font-medium">事務手数料タイプ（任意）</span>
          <select name="handlingFeeType" defaultValue={d.handlingFeeType} className={inputClass}>
            <option value="">未設定</option>
            {HANDLING_FEE_TYPES.map((t) => (
              <option key={t} value={t}>
                {handlingFeeTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            <span className="text-xs text-slate-500">事務手数料（定額・円）</span>
            <input type="text" name="handlingFeeYen" inputMode="numeric" defaultValue={d.handlingFeeYen} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">事務手数料（定率・%）</span>
            <input type="text" name="handlingFeePercent" inputMode="decimal" defaultValue={d.handlingFeePercent} className={inputClass} />
          </label>
        </div>
        <label className={labelClass}>
          <span className="text-xs text-slate-500">保証料（説明・任意）</span>
          <input type="text" name="guaranteeFeeDescription" maxLength={1000} defaultValue={d.guaranteeFeeDescription} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className="text-xs text-slate-500">その他費用（説明・任意）</span>
          <input type="text" name="otherFeesDescription" maxLength={1000} defaultValue={d.otherFeesDescription} className={inputClass} />
        </label>
      </Section>

      <Section title="適用条件">
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend className="text-xs text-slate-500">物件種別</legend>
          {PROPERTY_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1">
              <input
                type="checkbox"
                name="propertyTypes"
                value={t}
                defaultChecked={d.propertyTypes.includes(t)}
              />
              {propertyTypeLabel(t)}
            </label>
          ))}
        </fieldset>
        <label className={labelClass}>
          <span className="text-xs text-slate-500">対象エリア（カンマ区切り・任意）</span>
          <input type="text" name="eligibleAreas" defaultValue={d.eligibleAreas} placeholder="例: 東京都, 神奈川県" className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            <span className="text-xs text-slate-500">最低物件/借入額(円)</span>
            <input type="text" name="minLoanAmountYen" inputMode="numeric" defaultValue={d.minLoanAmountYen} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">最大借入額(円)</span>
            <input type="text" name="maxLoanAmountYen" inputMode="numeric" defaultValue={d.maxLoanAmountYen} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">最短借入期間(年)</span>
            <input type="text" name="minTermYears" inputMode="numeric" defaultValue={d.minTermYears} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">最長借入期間(年)</span>
            <input type="text" name="maxTermYears" inputMode="numeric" defaultValue={d.maxTermYears} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">LTV 上限(%)</span>
            <input type="text" name="maxLtvPercent" inputMode="decimal" defaultValue={d.maxLtvPercent} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">最低年収(円)</span>
            <input type="text" name="minAnnualIncomeYen" inputMode="numeric" defaultValue={d.minAnnualIncomeYen} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">最低勤続(月)</span>
            <input type="text" name="minEmploymentMonths" inputMode="numeric" defaultValue={d.minEmploymentMonths} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">最低年齢</span>
            <input type="text" name="minAge" inputMode="numeric" defaultValue={d.minAge} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">申込時上限年齢</span>
            <input type="text" name="maxApplicationAge" inputMode="numeric" defaultValue={d.maxApplicationAge} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">完済時上限年齢</span>
            <input type="text" name="maxAgeAtMaturity" inputMode="numeric" defaultValue={d.maxAgeAtMaturity} className={inputClass} />
          </label>
        </div>
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend className="text-xs text-slate-500">雇用形態</legend>
          {EMPLOYMENT_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1">
              <input
                type="checkbox"
                name="employmentTypes"
                value={t}
                defaultChecked={d.employmentTypes.includes(t)}
              />
              {employmentTypeLabel(t)}
            </label>
          ))}
        </fieldset>
        <label className={labelClass}>
          <span className="text-xs text-slate-500">団信条件（説明・任意）</span>
          <input type="text" name="groupCreditLifeInsuranceSummary" maxLength={1000} defaultValue={d.groupCreditLifeInsuranceSummary} className={inputClass} />
        </label>
      </Section>

      <Section title="管理情報">
        <label className={labelClass}>
          <span className="text-xs text-slate-500">顧客向け注意事項（任意）</span>
          <textarea name="customerDisclosure" rows={2} defaultValue={d.customerDisclosure} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className="text-xs text-slate-500">
            内部審査補足（社内のみ・顧客には表示されません）
          </span>
          <textarea name="internalUnderwritingNotes" rows={2} defaultValue={d.internalUnderwritingNotes} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className="text-xs text-slate-500">モゲチェック商品識別子（任意）</span>
          <input type="text" name="externalProductKey" maxLength={100} defaultValue={d.externalProductKey} className={inputClass} />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            <span className="text-xs text-slate-500">有効開始日</span>
            <input type="date" name="validFrom" defaultValue={d.validFrom} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">有効終了日</span>
            <input type="date" name="validUntil" defaultValue={d.validUntil} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">最終確認日</span>
            <input type="date" name="confirmedAt" defaultValue={d.confirmedAt} className={inputClass} />
          </label>
        </div>
      </Section>

      <div>
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
