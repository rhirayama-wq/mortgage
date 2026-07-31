"use client";

/**
 * デモ環境の常設表示（§19）とロール切替。
 * 目立ちすぎない帯で「デモ・架空データ・未接続・参考値」を明示する。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_NOTICE } from "@/lib/loan-checker-moc/constants";
import { useDemo } from "@/lib/loan-checker-moc/store";
import type { DemoRole } from "@/lib/loan-checker-moc/types";
import { cn } from "./ui";

export function DemoBanner() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-1.5 text-xs">
        <span className="rounded bg-amber-200 px-1.5 py-0.5 font-semibold">
          DEMO
        </span>
        <span className="truncate">{DEMO_NOTICE.short}・信用情報／eKYC／金融機関と未接続・表示は参考値</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto shrink-0 underline underline-offset-2"
          aria-expanded={open}
        >
          {open ? "閉じる" : "詳細"}
        </button>
      </div>
      {open ? (
        <div className="mx-auto max-w-6xl px-4 pb-2 text-xs">
          <ul className="list-disc space-y-0.5 pl-5">
            {DEMO_NOTICE.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const ROLE_TABS: Array<{ role: DemoRole; label: string; href: string }> = [
  { role: "agent", label: "営業担当者", href: "/loan-checker/dashboard" },
  { role: "customer", label: "顧客本人", href: "/loan-checker/customer" },
  { role: "admin", label: "MFS管理者", href: "/loan-checker/admin" },
];

export function RoleSwitcher() {
  const { role, setRole } = useDemo();
  const router = useRouter();

  function pick(next: { role: DemoRole; href: string }) {
    setRole(next.role);
    router.push(next.href);
  }

  return (
    <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="デモのロール切替">
      {ROLE_TABS.map((t) => {
        return (
          <button
            key={t.role}
            type="button"
            role="tab"
            aria-selected={role === t.role}
            onClick={() => pick(t)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition",
              role === t.role
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
