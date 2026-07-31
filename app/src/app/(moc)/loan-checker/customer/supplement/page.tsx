"use client";

/** 補足情報（§9.13）。完済予定・売却予定・資金援助・将来の収入変動・その他。 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerShell } from "@/components/loan-checker-moc/customer-shell";
import { Card, Field, Note, inputClass } from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";
import { manToYen, yenToMan } from "@/lib/loan-checker-moc/format";

export default function SupplementPage() {
  const { customerCase, updateCase, markStep } = useDemo();
  const router = useRouter();
  const s = customerCase?.supplement;

  const [payoff, setPayoff] = useState(s?.payoffPlannedDebts ?? "");
  const [sale, setSale] = useState(s?.salePlannedProperty ?? "");
  const [support, setSupport] = useState(
    s?.familySupportYen ? String(yenToMan(s.familySupportYen)) : "",
  );
  const [income, setIncome] = useState(s?.futureIncomeChange ?? "");
  const [note, setNote] = useState(s?.note ?? "");

  if (!customerCase) {
    return (
      <CustomerShell stepKey="supplement" title="補足情報">
        <Note tone="neutral">対象の案件が見つかりません。</Note>
      </CustomerShell>
    );
  }

  function next() {
    const id = customerCase!.id;
    const supportNum = Number(support);
    updateCase(id, (c) => ({
      ...c,
      supplement: {
        payoffPlannedDebts: payoff,
        salePlannedProperty: sale,
        familySupportYen:
          support.trim() === "" || Number.isNaN(supportNum)
            ? null
            : manToYen(supportNum),
        futureIncomeChange: income,
        note,
      },
    }));
    markStep(id, "supplementDone");
    router.push("/loan-checker/customer/consent");
  }

  return (
    <CustomerShell
      stepKey="supplement"
      title="補足情報"
      subtitle="任意です。当てはまるものがあればご記入ください。"
      footer={
        <button type="button" onClick={next} className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
          次へ（同意）
        </button>
      }
    >
      <Card>
        <div className="space-y-3">
          <Field label="完済予定の借入" htmlFor="po"><input id="po" className={inputClass} value={payoff} onChange={(e) => setPayoff(e.target.value)} placeholder="例: 自動車ローンを購入前に完済予定" /></Field>
          <Field label="売却予定の不動産" htmlFor="sa"><input id="sa" className={inputClass} value={sale} onChange={(e) => setSale(e.target.value)} /></Field>
          <Field label="親族からの資金援助（万円・任意）" htmlFor="su"><input id="su" type="number" className={inputClass} value={support} onChange={(e) => setSupport(e.target.value)} /></Field>
          <Field label="将来の収入変動の見込み" htmlFor="in"><input id="in" className={inputClass} value={income} onChange={(e) => setIncome(e.target.value)} placeholder="例: 3年後に育休から復職予定" /></Field>
          <Field label="その他の補足" htmlFor="nt">
            <textarea id="nt" rows={3} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Card>
    </CustomerShell>
  );
}
