"use client";

/**
 * 顧客招待（§9.3）。入力 → 確認 → 送信の3ステップ。
 * 営業が年収・既存借入・信用情報を入力する欄は設けない。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AgentShell } from "@/components/loan-checker-moc/agent-shell";
import {
  Card,
  Field,
  InfoRow,
  Note,
  inputClass,
  PrimaryLink,
  SecondaryLink,
} from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";
import { manToYen, yenToManYen } from "@/lib/loan-checker-moc/format";

type Step = "input" | "confirm" | "sent";

export default function InvitePage() {
  const { invite, setCustomerCase } = useDemo();
  const router = useRouter();

  const [step, setStep] = useState<Step>("input");
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [caseName, setCaseName] = useState("");
  const [priceMan, setPriceMan] = useState("6000");
  const [propertyName, setPropertyName] = useState("");
  const [message, setMessage] = useState("");
  const [newId, setNewId] = useState<string | null>(null);

  const priceYen = manToYen(Number(priceMan) || 0);
  const canProceed = customerName.trim() !== "" && email.trim() !== "" && priceYen > 0;

  function send() {
    const id = invite({
      customerName: customerName.trim(),
      email: email.trim(),
      caseName: caseName.trim(),
      desiredPriceYen: priceYen,
      desiredPropertyName: propertyName.trim(),
      message: message.trim(),
    });
    setNewId(id);
    setStep("sent");
  }

  function openCustomerDemo() {
    if (!newId) return;
    setCustomerCase(newId);
    router.push("/loan-checker/customer");
  }

  return (
    <AgentShell title="新しい顧客を招待">
      <div className="mx-auto max-w-xl">
        {step === "input" ? (
          <Card>
            <div className="space-y-4">
              <Field label="顧客名（必須）" htmlFor="cName">
                <input
                  id="cName"
                  className={inputClass}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="山田 太郎"
                />
              </Field>
              <Field label="メールアドレス（必須）" htmlFor="cEmail" hint="架空の @example.test を使用します">
                <input
                  id="cEmail"
                  type="email"
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="taro.yamada@example.test"
                />
              </Field>
              <Field label="案件名" htmlFor="cCase">
                <input
                  id="cCase"
                  className={inputClass}
                  value={caseName}
                  onChange={(e) => setCaseName(e.target.value)}
                  placeholder="山田様 新築マンション購入"
                />
              </Field>
              <Field label="希望物件価格（万円・必須）" htmlFor="cPrice">
                <input
                  id="cPrice"
                  type="number"
                  inputMode="numeric"
                  className={inputClass}
                  value={priceMan}
                  onChange={(e) => setPriceMan(e.target.value)}
                />
              </Field>
              <Field label="希望物件名" htmlFor="cProp">
                <input
                  id="cProp"
                  className={inputClass}
                  value={propertyName}
                  onChange={(e) => setPropertyName(e.target.value)}
                  placeholder="（仮）港区新築マンション"
                />
              </Field>
              <Field label="任意メッセージ" htmlFor="cMsg">
                <textarea
                  id="cMsg"
                  className={inputClass}
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="ご検討中の物件について、まず住宅ローンの見込みを確認しましょう。"
                />
              </Field>

              <Note tone="neutral">
                年収・既存借入・信用情報は営業が入力しません。顧客本人が入力・同意します。
              </Note>

              <button
                type="button"
                disabled={!canProceed}
                onClick={() => setStep("confirm")}
                className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                招待内容を確認
              </button>
            </div>
          </Card>
        ) : null}

        {step === "confirm" ? (
          <Card>
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              招待内容の確認
            </h2>
            <dl>
              <InfoRow label="顧客名" value={customerName} />
              <InfoRow label="メールアドレス" value={email} />
              <InfoRow label="案件名" value={caseName || "（未入力）"} />
              <InfoRow label="希望物件価格" value={yenToManYen(priceYen)} />
              <InfoRow label="希望物件名" value={propertyName || "（未入力）"} />
              <InfoRow label="メッセージ" value={message || "（なし）"} />
            </dl>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setStep("input")}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                修正する
              </button>
              <button
                type="button"
                onClick={send}
                className="flex-1 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white"
              >
                招待を送信（デモ）
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              実際のメール送信は行いません。案件を「招待送信済み」にします。
            </p>
          </Card>
        ) : null}

        {step === "sent" && newId ? (
          <Card>
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
                ✓
              </div>
              <h2 className="text-base font-semibold text-slate-900">
                招待を送信しました（デモ）
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {customerName}様の案件を「招待送信済み」で作成しました。
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={openCustomerDemo}
                className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white"
              >
                顧客側デモ画面を開く
              </button>
              <PrimaryLink href={`/loan-checker/cases/${newId}`} className="w-full bg-slate-800 hover:bg-slate-900">
                案件詳細を見る
              </PrimaryLink>
              <SecondaryLink href="/loan-checker/cases" className="w-full">
                案件一覧へ戻る
              </SecondaryLink>
            </div>
          </Card>
        ) : null}
      </div>
    </AgentShell>
  );
}
