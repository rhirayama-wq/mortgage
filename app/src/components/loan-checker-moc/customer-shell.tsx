"use client";

/**
 * 顧客向けシェル（スマートフォン最優先・1画面1テーマ）。
 * ステップ表示・自動保存風の表示・残り時間の目安を表示する。
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { CUSTOMER_STEPS } from "@/lib/loan-checker-moc/constants";
import { cn } from "./ui";

export function CustomerShell({
  stepKey,
  title,
  subtitle,
  children,
  footer,
  backHref,
  minutesLeft,
}: {
  stepKey: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  backHref?: string;
  minutesLeft?: number;
}) {
  const index = CUSTOMER_STEPS.findIndex((s) => s.key === stepKey);
  const stepNo = index >= 0 ? index + 1 : 1;
  const total = CUSTOMER_STEPS.length;
  const pct = Math.round((stepNo / total) * 100);
  const prev =
    backHref ??
    (index > 0 ? CUSTOMER_STEPS[index - 1]?.path : undefined);

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-4">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>
          ステップ {stepNo} / {total}
        </span>
        <span>{minutesLeft ? `残り 約${minutesLeft}分` : "所要 約10分"}</span>
      </div>
      <div
        className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="入力の進捗"
      >
        <div className="h-full rounded-full bg-sky-600" style={{ width: `${pct}%` }} />
      </div>

      <header className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        ) : null}
      </header>

      <div className="space-y-4">{children}</div>

      <div className="mt-6 flex items-center gap-2 text-xs text-slate-400">
        <span aria-hidden="true">💾</span>
        <span>入力内容は自動保存されています（デモ）</span>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          {prev ? (
            <Link
              href={prev}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              戻る
            </Link>
          ) : (
            <span />
          )}
          <div className={cn("flex-1", prev ? "" : "ml-0")}>{footer}</div>
        </div>
      </div>
    </div>
  );
}
