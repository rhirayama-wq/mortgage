"use client";

/** 本人確認方法選択（§9.7）＋ eKYCデモ（§9.8）。実画像アップロードなし・マイナンバー非表示。 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerShell } from "@/components/loan-checker-moc/customer-shell";
import { Card, Note } from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";
import type { IdentityMethod } from "@/lib/loan-checker-moc/types";

const STEPS: Record<IdentityMethod, string[]> = {
  drivers_license: [
    "運転免許証を撮影しています（デモ）",
    "記載内容を読み取っています（OCRデモ）",
    "顔写真と照合しています（顔照合デモ）",
    "読み取りに成功しました",
  ],
  my_number_card: [
    "マイナンバーカードをNFCで読み取っています（デモ）",
    "電子証明書を確認しています（JPKIデモ）",
    "読み取りに成功しました",
  ],
};

const METHOD_LABEL: Record<IdentityMethod, string> = {
  drivers_license: "運転免許証",
  my_number_card: "マイナンバーカード",
};

export default function IdentityPage() {
  const { customerCase, setIdentity } = useDemo();
  const router = useRouter();
  const [method, setMethod] = useState<IdentityMethod | null>(null);
  const [step, setStep] = useState(0);

  const caseId = customerCase?.id;
  const steps = method ? STEPS[method] : [];
  const done = method !== null && step >= steps.length - 1;

  function advance() {
    if (!method) return;
    if (step < steps.length - 1) {
      setStep((s) => s + 1);
      if (step + 1 === steps.length - 1 && caseId) {
        setIdentity(caseId, method, "verified");
      }
    }
  }

  const footer =
    method && done ? (
      <button
        type="button"
        onClick={() => router.push("/loan-checker/customer/profile")}
        className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white"
      >
        基本情報の確認へ進む
      </button>
    ) : method ? (
      <button
        type="button"
        onClick={advance}
        className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white"
      >
        {step === 0 ? "読み取りを開始" : "次へ"}
      </button>
    ) : (
      <span className="block text-center text-xs text-slate-400">
        本人確認の方法を選択してください
      </span>
    );

  return (
    <CustomerShell
      stepKey="identity"
      title="本人確認（eKYC）"
      subtitle="実際の撮影・アップロードは不要のデモです。ボタンで読み取りを進めます。"
      backHref="/loan-checker/customer"
      footer={footer}
    >
      {!method ? (
        <div className="grid grid-cols-1 gap-3">
          {(Object.keys(METHOD_LABEL) as IdentityMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMethod(m);
                setStep(0);
              }}
              className="rounded-xl border border-slate-300 bg-white p-4 text-left hover:border-sky-400 hover:bg-sky-50"
            >
              <div className="text-sm font-semibold text-slate-900">
                {METHOD_LABEL[m]}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {m === "drivers_license"
                  ? "撮影 → OCR → 顔照合（デモ）"
                  : "NFC読取 → JPKI確認（デモ）"}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Card>
          <div className="mb-2 text-xs text-slate-500">
            選択: {METHOD_LABEL[method]}
          </div>
          <ol className="space-y-2">
            {steps.map((label, i) => {
              const state =
                i < step ? "done" : i === step ? "current" : "todo";
              return (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className={
                      state === "done"
                        ? "text-emerald-600"
                        : state === "current"
                          ? "text-sky-600"
                          : "text-slate-300"
                    }
                  >
                    {state === "done" ? "●" : state === "current" ? "◐" : "○"}
                  </span>
                  <span
                    className={state === "todo" ? "text-slate-400" : "text-slate-800"}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-3">
            <Note tone="neutral">
              デモです。マイナンバー（個人番号）は表示・保存しません。書類画像も保存しません。
            </Note>
          </div>
        </Card>
      )}
    </CustomerShell>
  );
}
