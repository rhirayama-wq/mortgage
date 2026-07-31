"use client";

/** 診断中（§9.15）。固定演出で5ステップを進め、完了で結果を作成する（架空）。 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerShell } from "@/components/loan-checker-moc/customer-shell";
import { Card, Note } from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";

const PHASES = [
  "本人情報を確認しています",
  "信用情報を確認しています",
  "金融機関・商品を分析しています",
  "購入可能価格帯を計算しています",
  "診断結果を作成しています",
];

export default function ProcessingPage() {
  const { customerCase, completeAssessment } = useDemo();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const completedRef = useRef(false);
  const id = customerCase?.id;

  useEffect(() => {
    if (index >= PHASES.length) return;
    const t = setTimeout(() => setIndex((i) => i + 1), 950);
    return () => clearTimeout(t);
  }, [index]);

  useEffect(() => {
    if (index >= PHASES.length && !completedRef.current && id) {
      completedRef.current = true;
      completeAssessment(id);
    }
  }, [index, id, completeAssessment]);

  const done = index >= PHASES.length;

  return (
    <CustomerShell
      stepKey="processing"
      title="診断中"
      subtitle="架空データを用いた固定演出です。ネットワーク障害等は再現しません。"
      backHref="/loan-checker/customer/consent"
      footer={
        done ? (
          <button
            type="button"
            onClick={() => router.push("/loan-checker/customer/result")}
            className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white"
          >
            診断結果を見る
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIndex(PHASES.length)}
            className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
          >
            スキップして結果へ
          </button>
        )
      }
    >
      <Card>
        <ol className="space-y-3">
          {PHASES.map((label, i) => {
            const state = i < index ? "done" : i === index ? "current" : "todo";
            return (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className={
                    state === "done"
                      ? "text-emerald-600"
                      : state === "current"
                        ? "animate-pulse text-sky-600"
                        : "text-slate-300"
                  }
                >
                  {state === "done" ? "●" : state === "current" ? "◐" : "○"}
                </span>
                <span className={state === "todo" ? "text-slate-400" : "text-slate-800"}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
        {done ? (
          <div className="mt-4">
            <Note tone="success" title="診断が完了しました">
              購入可能価格帯や金融機関候補がまとまりました。
            </Note>
          </div>
        ) : null}
      </Card>
    </CustomerShell>
  );
}
