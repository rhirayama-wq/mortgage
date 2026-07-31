"use client";

/** 世帯・共同申込者（§9.11）。ペアローン・収入合算・共同申込者の有無。 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerShell } from "@/components/loan-checker-moc/customer-shell";
import { Card, Field, Note, inputClass, selectClass } from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";
import { manToYen, yenToMan } from "@/lib/loan-checker-moc/format";

export default function HouseholdPage() {
  const { customerCase, updateCase, markStep } = useDemo();
  const router = useRouter();
  const h = customerCase?.household;

  const [marital, setMarital] = useState(h?.maritalStatus ?? "既婚");
  const [children, setChildren] = useState(String(h?.children ?? 0));
  const [pair, setPair] = useState(h?.wantsPairLoan ?? false);
  const [combine, setCombine] = useState(h?.wantsIncomeCombination ?? false);
  const [coApp, setCoApp] = useState(h?.hasCoApplicant ?? false);
  const [coIncome, setCoIncome] = useState(
    String(h?.coApplicantIncomeYen ? yenToMan(h.coApplicantIncomeYen) : 0),
  );

  if (!customerCase) {
    return (
      <CustomerShell stepKey="household" title="世帯・共同申込">
        <Note tone="neutral">対象の案件が見つかりません。</Note>
      </CustomerShell>
    );
  }

  function next() {
    const id = customerCase!.id;
    updateCase(id, (c) => ({
      ...c,
      household: {
        maritalStatus: marital,
        children: Number(children) || 0,
        wantsPairLoan: pair,
        wantsIncomeCombination: combine,
        hasCoApplicant: coApp,
        coApplicantIncomeYen: coApp ? manToYen(Number(coIncome) || 0) : null,
      },
    }));
    markStep(id, "householdDone");
    router.push("/loan-checker/customer/property");
  }

  const checkRow = (
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void,
  ) => (
    <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
      <span className="text-slate-700">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
    </label>
  );

  return (
    <CustomerShell
      stepKey="household"
      title="世帯・共同申込者"
      subtitle="ペアローンや収入合算は、借入可能額に影響します。"
      footer={
        <button type="button" onClick={next} className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
          次へ（購入希望）
        </button>
      }
    >
      <Card>
        <div className="space-y-3">
          <Field label="婚姻状況" htmlFor="mar">
            <select id="mar" className={selectClass} value={marital} onChange={(e) => setMarital(e.target.value)}>
              <option value="既婚">既婚</option>
              <option value="未婚">未婚</option>
              <option value="その他">その他</option>
            </select>
          </Field>
          <Field label="子どもの人数" htmlFor="ch">
            <input id="ch" type="number" inputMode="numeric" className={inputClass} value={children} onChange={(e) => setChildren(e.target.value)} />
          </Field>
          <div className="space-y-2">
            {checkRow("ペアローンを希望する", pair, setPair)}
            {checkRow("収入合算を希望する", combine, setCombine)}
            {checkRow("共同申込者がいる", coApp, setCoApp)}
          </div>
          {coApp ? (
            <Field label="共同申込者の年収（万円）" htmlFor="coinc">
              <input id="coinc" type="number" inputMode="numeric" className={inputClass} value={coIncome} onChange={(e) => setCoIncome(e.target.value)} />
            </Field>
          ) : null}
        </div>
      </Card>
      <Note tone="neutral">
        ペアローン等を利用する場合、共同申込者の本人確認・同意が別途必要になります。
      </Note>
    </CustomerShell>
  );
}
