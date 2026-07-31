"use client";

/** モゲチェック相談（§13）。希望日時・方法・内容。診断結果を引き継ぐ旨を明示。実予約・送信なし。 */

import { useState } from "react";
import {
  Card,
  Field,
  Note,
  inputClass,
  selectClass,
  PrimaryLink,
  SecondaryLink,
} from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";
import { SEED_YAMADA_ID } from "@/lib/loan-checker-moc/fixtures";

export default function ConsultationPage() {
  const { customerCase, submitConsultation } = useDemo();
  const targetId = customerCase?.id ?? SEED_YAMADA_ID;

  const [sent, setSent] = useState(false);
  const [date, setDate] = useState("平日夜 20:00頃");
  const [method, setMethod] = useState("オンライン");
  const [topic, setTopic] = useState("");

  function submit() {
    submitConsultation(targetId, {
      preferredDate: date,
      method,
      topic: topic.trim(),
    });
    setSent(true);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-lg font-semibold text-slate-900">
        モゲチェックに相談する
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        住宅ローンの専門家に相談できます。診断結果はそのまま引き継がれます。
      </p>

      {!sent ? (
        <Card className="mt-4">
          <div className="space-y-4">
            <Field label="希望する相談日時" htmlFor="date">
              <input id="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="相談方法" htmlFor="method">
              <select id="method" className={selectClass} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option>オンライン</option>
                <option>電話</option>
                <option>対面</option>
              </select>
            </Field>
            <Field label="相談したい内容" htmlFor="topic" hint="任意">
              <textarea id="topic" rows={3} className={inputClass} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="例: 自動車ローンを完済すべきか相談したい" />
            </Field>

            <Note tone="info">
              この相談には診断結果（購入可能価格帯・金融機関候補・注意点など）が引き継がれます。
            </Note>

            <button
              type="button"
              onClick={submit}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              相談を申し込む（デモ）
            </button>
            <p className="text-center text-xs text-slate-400">
              実際の予約システムやメール送信には接続しません。
            </p>
          </div>
        </Card>
      ) : (
        <Card className="mt-4">
          <div className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
              ✓
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              相談を申し込みました（デモ）
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              担当者が日程を調整してご連絡します。案件は「相談依頼済み」になりました。
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <PrimaryLink href={`/loan-checker/cases/${targetId}`} className="w-full">
              案件詳細を見る（営業）
            </PrimaryLink>
            <SecondaryLink href="/loan-checker" className="w-full">
              トップへ戻る
            </SecondaryLink>
          </div>
        </Card>
      )}
    </div>
  );
}
