"use client";

/**
 * 営業担当者向けシェル（PC前提の左ナビ）。モバイルでは横スクロールのタブになる。
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AGENT_NAV } from "@/lib/loan-checker-moc/constants";
import { useDemo } from "@/lib/loan-checker-moc/store";
import { cn } from "./ui";

export function AgentShell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { reset } = useDemo();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 md:flex-row">
      <nav className="md:w-56 md:shrink-0" aria-label="営業メニュー">
        <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          モゲチェック Loan Checker
        </div>
        <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {AGENT_NAV.map((item) => {
            const active =
              pathname === item.path ||
              (item.path !== "/loan-checker/cases" &&
                pathname.startsWith(item.path)) ||
              (item.path === "/loan-checker/cases" &&
                pathname.startsWith("/loan-checker/cases") &&
                !pathname.endsWith("/new"));
            return (
              <li key={item.path} className="shrink-0">
                <Link
                  href={item.path}
                  className={cn(
                    "block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium",
                    active
                      ? "bg-sky-700 text-white"
                      : "text-slate-700 hover:bg-slate-100",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={reset}
          className="mt-3 hidden w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 md:block"
        >
          デモデータを初期化
        </button>
      </nav>

      <main className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
