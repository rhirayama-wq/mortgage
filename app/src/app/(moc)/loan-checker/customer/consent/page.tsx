"use client";

/** 同意（§9.14）。各同意を個別に確認。共有情報・非共有情報を明示。 */

import { useRouter } from "next/navigation";
import { CustomerShell } from "@/components/loan-checker-moc/customer-shell";
import { Card, Note, Bullets } from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";

export default function ConsentPage() {
  const { customerCase, setConsentGranted, updateCase, markStep } = useDemo();
  const router = useRouter();

  if (!customerCase) {
    return (
      <CustomerShell stepKey="consent" title="同意">
        <Note tone="neutral">対象の案件が見つかりません。</Note>
      </CustomerShell>
    );
  }

  const consent = customerCase.consent;
  const id = customerCase.id;
  const requiredOk = consent.items
    .filter((it) => it.required)
    .every((it) => it.granted);

  function next() {
    markStep(id, "consentDone");
    updateCase(id, (c) => ({ ...c, flow: { ...c.flow, consentDone: true }, status: "assessing" }));
    router.push("/loan-checker/customer/processing");
  }

  return (
    <CustomerShell
      stepKey="consent"
      title="各種同意"
      subtitle="診断のために、以下の項目へ個別にご同意ください。"
      footer={
        <button
          type="button"
          onClick={next}
          disabled={!requiredOk}
          className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          同意して診断を開始
        </button>
      }
    >
      <Card>
        <ul className="space-y-2">
          {consent.items.map((it) => (
            <li key={it.key}>
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                <input
                  type="checkbox"
                  checked={it.granted}
                  onChange={(e) => setConsentGranted(id, it.key, e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="text-sm text-slate-800">
                  {it.label}
                  {it.required ? (
                    <span className="ml-1 text-xs font-semibold text-rose-600">必須</span>
                  ) : (
                    <span className="ml-1 text-xs text-slate-400">任意</span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
        {!requiredOk ? (
          <p className="mt-2 text-xs text-rose-600">
            必須項目すべてに同意すると診断を開始できます。
          </p>
        ) : null}
      </Card>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <div className="mb-1 text-xs font-semibold text-emerald-800">
          不動産会社に共有される情報（要約のみ）
        </div>
        <Bullets items={consent.sharedFields} />
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="mb-1 text-xs font-semibold text-slate-700">共有されない情報</div>
        <Bullets items={consent.nonSharedFields} />
      </div>
    </CustomerShell>
  );
}
