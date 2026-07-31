"use client";

/** 例外・エラー画面の共通パネル（§20）。原因は一般向け表現。内部情報・tokenは一切表示しない。 */

import Link from "next/link";

export interface ErrorAction {
  label: string;
  href: string;
  primary?: boolean;
}

export function ErrorPanel({
  title,
  cause,
  actions,
}: {
  title: string;
  cause: string;
  actions: ErrorAction[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
      <div
        aria-hidden="true"
        className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl text-amber-700"
      >
        !
      </div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{cause}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {actions.map((a) => (
          <Link
            key={a.label}
            href={a.href}
            className={
              a.primary
                ? "inline-flex items-center rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
                : "inline-flex items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            }
          >
            {a.label}
          </Link>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-400">
        内部エラーの詳細・トークン等は表示しません。問題が続く場合は担当者へお問い合わせください。
      </p>
    </div>
  );
}
