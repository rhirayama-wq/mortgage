"use client";

/** 購入希望（§9.12）。金額は万円入力→円保存。 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerShell } from "@/components/loan-checker-moc/customer-shell";
import { Card, Field, Note, inputClass, selectClass } from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";
import { manToYen, yenToMan } from "@/lib/loan-checker-moc/format";

function manStr(yen: number | null): string {
  return yen === null ? "" : String(yenToMan(yen));
}
function toYenOrNull(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || Number.isNaN(n) ? null : manToYen(n);
}
function numOrNull(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || Number.isNaN(n) ? null : n;
}

export default function PropertyPage() {
  const { customerCase, updateCase, markStep } = useDemo();
  const router = useRouter();
  const p = customerCase?.property;

  const [price, setPrice] = useState(String(p ? yenToMan(p.desiredPriceYen) : 0));
  const [loan, setLoan] = useState(String(p ? yenToMan(p.desiredLoanYen) : 0));
  const [own, setOwn] = useState(String(p ? yenToMan(p.ownFundsYen) : 0));
  const [term, setTerm] = useState(String(p?.desiredTermYears ?? 35));
  const [monthly, setMonthly] = useState(manStr(p?.desiredMonthlyPaymentYen ?? null));
  const [ptype, setPtype] = useState(p?.propertyType ?? "マンション");
  const [nou, setNou] = useState(p?.newOrUsed ?? "新築");
  const [loc, setLoc] = useState(p?.location ?? "");
  const [size, setSize] = useState(p?.sizeSqm === null || p?.sizeSqm === undefined ? "" : String(p.sizeSqm));
  const [age, setAge] = useState(p?.buildingAgeYears === null || p?.buildingAgeYears === undefined ? "" : String(p.buildingAgeYears));
  const [timing, setTiming] = useState(p?.purchaseTiming ?? "6か月以内");

  if (!customerCase) {
    return (
      <CustomerShell stepKey="property" title="購入希望">
        <Note tone="neutral">対象の案件が見つかりません。</Note>
      </CustomerShell>
    );
  }

  function next() {
    const id = customerCase!.id;
    const priceYen = manToYen(Number(price) || 0);
    updateCase(id, (c) => ({
      ...c,
      desiredPriceYen: priceYen,
      property: {
        desiredPriceYen: priceYen,
        desiredLoanYen: manToYen(Number(loan) || 0),
        ownFundsYen: manToYen(Number(own) || 0),
        desiredTermYears: Number(term) || 0,
        desiredMonthlyPaymentYen: toYenOrNull(monthly),
        propertyType: ptype,
        newOrUsed: nou,
        location: loc,
        sizeSqm: numOrNull(size),
        buildingAgeYears: numOrNull(age),
        purchaseTiming: timing,
      },
    }));
    markStep(id, "propertyDone");
    router.push("/loan-checker/customer/supplement");
  }

  return (
    <CustomerShell
      stepKey="property"
      title="購入希望"
      subtitle="ご希望の物件・借入条件を教えてください。"
      footer={
        <button type="button" onClick={next} className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
          次へ（補足情報）
        </button>
      }
    >
      <Card>
        <div className="grid grid-cols-2 gap-3">
          <Field label="希望物件価格（万円）" htmlFor="pr"><input id="pr" type="number" className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          <Field label="希望借入額（万円）" htmlFor="ln"><input id="ln" type="number" className={inputClass} value={loan} onChange={(e) => setLoan(e.target.value)} /></Field>
          <Field label="自己資金（万円）" htmlFor="ow"><input id="ow" type="number" className={inputClass} value={own} onChange={(e) => setOwn(e.target.value)} /></Field>
          <Field label="希望返済期間（年）" htmlFor="tm"><input id="tm" type="number" className={inputClass} value={term} onChange={(e) => setTerm(e.target.value)} /></Field>
          <Field label="希望月額返済（万円・任意）" htmlFor="mo"><input id="mo" type="number" className={inputClass} value={monthly} onChange={(e) => setMonthly(e.target.value)} /></Field>
          <Field label="購入予定時期" htmlFor="ti">
            <select id="ti" className={selectClass} value={timing} onChange={(e) => setTiming(e.target.value)}>
              <option>3か月以内</option>
              <option>6か月以内</option>
              <option>1年以内</option>
              <option>未定</option>
            </select>
          </Field>
          <Field label="物件種別" htmlFor="pt">
            <select id="pt" className={selectClass} value={ptype} onChange={(e) => setPtype(e.target.value)}>
              <option>マンション</option>
              <option>戸建て</option>
              <option>土地</option>
              <option>その他</option>
            </select>
          </Field>
          <Field label="新築・中古" htmlFor="nu">
            <select id="nu" className={selectClass} value={nou} onChange={(e) => setNou(e.target.value)}>
              <option>新築</option>
              <option>中古</option>
            </select>
          </Field>
          <Field label="面積（㎡・任意）" htmlFor="sz"><input id="sz" type="number" className={inputClass} value={size} onChange={(e) => setSize(e.target.value)} /></Field>
          <Field label="築年数（年・任意）" htmlFor="ag"><input id="ag" type="number" className={inputClass} value={age} onChange={(e) => setAge(e.target.value)} /></Field>
        </div>
        <div className="mt-3">
          <Field label="所在地" htmlFor="lc"><input id="lc" className={inputClass} value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="東京都〇〇区（架空）" /></Field>
        </div>
      </Card>
    </CustomerShell>
  );
}
