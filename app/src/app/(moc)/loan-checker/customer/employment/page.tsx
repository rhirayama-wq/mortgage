"use client";

/** 勤務・収入情報（§9.10）。金額は万円で入力し、保存時に円へ変換する。 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerShell } from "@/components/loan-checker-moc/customer-shell";
import { Card, Field, Note, inputClass, selectClass } from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";
import { manToYen, yenToMan } from "@/lib/loan-checker-moc/format";

const EMPLOYMENT_TYPES = ["正社員", "契約社員", "派遣社員", "自営業", "公務員", "その他"];

export default function EmploymentPage() {
  const { customerCase, updateCase, markStep } = useDemo();
  const router = useRouter();
  const e = customerCase?.employment;

  const [employer, setEmployer] = useState(e?.employer ?? "");
  const [type, setType] = useState(e?.employmentType ?? "正社員");
  const [years, setYears] = useState(String(e?.yearsEmployed ?? 0));
  const [prev, setPrev] = useState(String(e ? yenToMan(e.annualIncomePrevYen) : 0));
  const [curr, setCurr] = useState(
    String(e ? yenToMan(e.annualIncomeCurrentEstimateYen) : 0),
  );
  const [bonus, setBonus] = useState(String(e ? yenToMan(e.bonusYen) : 0));
  const [other, setOther] = useState(String(e ? yenToMan(e.otherIncomeYen) : 0));

  if (!customerCase) {
    return (
      <CustomerShell stepKey="employment" title="勤務・収入">
        <Note tone="neutral">対象の案件が見つかりません。</Note>
      </CustomerShell>
    );
  }

  function next() {
    const id = customerCase!.id;
    updateCase(id, (c) => ({
      ...c,
      employment: {
        employer,
        employmentType: type,
        yearsEmployed: Number(years) || 0,
        annualIncomePrevYen: manToYen(Number(prev) || 0),
        annualIncomeCurrentEstimateYen: manToYen(Number(curr) || 0),
        bonusYen: manToYen(Number(bonus) || 0),
        otherIncomeYen: manToYen(Number(other) || 0),
      },
    }));
    markStep(id, "employmentDone");
    router.push("/loan-checker/customer/household");
  }

  return (
    <CustomerShell
      stepKey="employment"
      title="勤務・収入情報"
      subtitle="返済可能額の目安に使います。金額は万円単位で入力してください。"
      footer={
        <button type="button" onClick={next} className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
          次へ（世帯・共同申込）
        </button>
      }
    >
      <Card>
        <div className="space-y-3">
          <Field label="勤務先" htmlFor="emp">
            <input id="emp" className={inputClass} value={employer} onChange={(e) => setEmployer(e.target.value)} />
          </Field>
          <Field label="雇用形態" htmlFor="type">
            <select id="type" className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="勤続年数（年）" htmlFor="yrs">
            <input id="yrs" type="number" inputMode="numeric" className={inputClass} value={years} onChange={(e) => setYears(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="前年度年収（万円）" htmlFor="prev">
              <input id="prev" type="number" inputMode="numeric" className={inputClass} value={prev} onChange={(e) => setPrev(e.target.value)} />
            </Field>
            <Field label="当年度見込み（万円）" htmlFor="curr">
              <input id="curr" type="number" inputMode="numeric" className={inputClass} value={curr} onChange={(e) => setCurr(e.target.value)} />
            </Field>
            <Field label="賞与（万円）" htmlFor="bonus">
              <input id="bonus" type="number" inputMode="numeric" className={inputClass} value={bonus} onChange={(e) => setBonus(e.target.value)} />
            </Field>
            <Field label="その他収入（万円）" htmlFor="other">
              <input id="other" type="number" inputMode="numeric" className={inputClass} value={other} onChange={(e) => setOther(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>
      <Note tone="neutral">入力内容の要約のみが担当者へ共有されます。原票は共有されません。</Note>
    </CustomerShell>
  );
}
