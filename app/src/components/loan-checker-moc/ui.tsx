/**
 * Loan Checker MoC 共通UIプリミティブ（presentational）。
 * 判定・ステータスは色のみに依存させず、記号/ラベルを併記する（アクセシビリティ）。
 */

import Link from "next/link";
import type { ReactNode } from "react";
import type { CaseStatus, Confidence, LenderVerdict } from "@/lib/loan-checker-moc/types";
import {
  CASE_STATUS_LABELS,
  CASE_STATUS_TONE,
  CONFIDENCE_LABELS,
  VERDICT_META,
} from "@/lib/loan-checker-moc/constants";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
export const selectClass = inputClass;

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold text-slate-900">{children}</h2>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  emphasize,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div
        className={cn(
          "mt-1 font-bold tabular-nums text-slate-900",
          emphasize ? "text-2xl" : "text-lg",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

export function VerdictBadge({ verdict }: { verdict: LenderVerdict }) {
  const m = VERDICT_META[verdict];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        m.toneClass,
      )}
    >
      <span aria-hidden="true">{m.symbol}</span>
      <span>{m.label}</span>
      <span className="sr-only">（{m.description}）</span>
    </span>
  );
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        CASE_STATUS_TONE[status],
      )}
    >
      {CASE_STATUS_LABELS[status]}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
      診断確度: {CONFIDENCE_LABELS[confidence]}
    </span>
  );
}

export function InfoRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

type NoteTone = "info" | "warn" | "success" | "neutral";

const NOTE_TONE: Record<NoteTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

export function Note({
  tone = "info",
  title,
  children,
}: {
  tone?: NoteTone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border p-3 text-sm", NOTE_TONE[tone])}>
      {title ? <div className="mb-1 font-semibold">{title}</div> : null}
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export function PrimaryLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function SecondaryLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
      {items.map((it, idx) => (
        <li key={idx}>{it}</li>
      ))}
    </ul>
  );
}
