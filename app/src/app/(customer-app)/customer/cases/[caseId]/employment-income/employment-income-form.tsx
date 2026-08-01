"use client";

/**
 * 顧客の勤務・収入情報フォーム（クライアント）。
 * - デバウンス(800ms)＋blur でオートセーブし、Server Action saveEmploymentIncome を呼ぶ。
 * - 保存はシリアライズし、常に最新値を送る（古い保存が新しい値を上書きしない）。
 * - 財務値は console / URL へ出さない。認可・保存・完了判定の正本はサーバー(RPC/DB 純粋関数)側。
 * - 「完了」表示は DB 由来（is_complete / missing_fields）で、TS では判定しない。
 * - 編集不可（案件が opened/inputting 以外）の場合は読み取り専用表示にする。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  validateEmploymentIncome,
  missingFieldLabels,
  EMPLOYMENT_TYPES,
  INCOME_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  INCOME_TYPE_LABELS,
  type EmploymentIncomeInput,
  type EmploymentIncomeFieldError,
} from "@/lib/customer-cases/employment-income";
import { saveEmploymentIncome } from "./actions";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const FIELD_ERROR_LABEL: Record<EmploymentIncomeFieldError, string> = {
  employer_name: "勤務先名",
  employment_type: "雇用形態",
  employment_started_on: "入社年月",
  annual_gross_income_yen: "年収（額面）",
  income_type: "収入区分",
};

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ja-JP");
}

export function EmploymentIncomeForm({
  applicantId,
  initial,
  editable,
  initialIsComplete,
  initialMissingFields,
}: {
  applicantId: string;
  initial: EmploymentIncomeInput;
  editable: boolean;
  initialIsComplete: boolean;
  initialMissingFields: string[];
}) {
  const [values, setValues] = useState<EmploymentIncomeInput>(initial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<EmploymentIncomeFieldError[]>([]);
  const [isComplete, setIsComplete] = useState<boolean>(initialIsComplete);
  const [missingFields, setMissingFields] = useState<string[]>(initialMissingFields);

  const valuesRef = useRef(values);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);

  const runSave = useCallback(async () => {
    if (!editable) return;
    const errs = validateEmploymentIncome(valuesRef.current);
    if (errs.length > 0) {
      setFieldErrors(errs);
      setStatus("error");
      setMessage("入力内容をご確認ください。");
      return;
    }
    setFieldErrors([]);
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    savingRef.current = true;
    setStatus("saving");
    setMessage(null);
    try {
      const res = await saveEmploymentIncome(applicantId, valuesRef.current);
      if (res.ok) {
        setStatus("saved");
        setSavedAt(res.savedAt);
        setIsComplete(res.isComplete);
        setMissingFields(res.missingFields);
      } else {
        setStatus("error");
        if (res.fieldErrors && res.fieldErrors.length > 0) {
          setFieldErrors(res.fieldErrors);
        }
        setMessage(
          res.error === "not_authorized"
            ? "この案件を編集する権限がありません。"
            : res.error === "not_inputtable"
              ? "この案件は現在編集できません。"
              : res.error === "validation"
                ? "入力内容をご確認ください。"
                : "保存に失敗しました。時間をおいて再度お試しください。",
        );
      }
    } catch {
      setStatus("error");
      setMessage("保存に失敗しました。通信環境をご確認ください。");
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void runSave();
      }
    }
  }, [applicantId, editable]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void runSave();
    }, 800);
  }, [runSave]);

  const flushNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void runSave();
  }, [runSave]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const update = (field: keyof EmploymentIncomeInput, value: string) => {
    setValues((v) => {
      const nv = { ...v, [field]: value };
      valuesRef.current = nv;
      return nv;
    });
    scheduleSave();
  };

  const hasFieldError = (f: EmploymentIncomeFieldError) => fieldErrors.includes(f);
  const inputClass = (f: EmploymentIncomeFieldError) =>
    `rounded border px-3 py-2 text-sm ${
      hasFieldError(f) ? "border-red-400 bg-red-50" : "border-slate-300"
    }`;

  if (!editable) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        この案件は現在、勤務・収入情報を編集できない状態です。
      </div>
    );
  }

  const missingLabels = missingFieldLabels(missingFields);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs" aria-live="polite" data-testid="autosave-status">
        {status === "saving" ? (
          <span className="text-slate-500">保存中…</span>
        ) : status === "saved" ? (
          <span className="text-green-700">
            保存しました{savedAt ? `（${formatTime(savedAt)}）` : ""}
          </span>
        ) : status === "error" ? (
          <span className="text-red-700">{message ?? "保存に失敗しました。"}</span>
        ) : (
          <span className="text-slate-400">入力すると自動保存されます。</span>
        )}
      </div>

      <div
        className={`rounded border p-2 text-xs ${
          isComplete
            ? "border-green-300 bg-green-50 text-green-800"
            : "border-slate-300 bg-slate-50 text-slate-700"
        }`}
        data-testid="employment-income-completeness"
      >
        {isComplete
          ? "必要な項目がすべて入力されています。"
          : missingLabels.length > 0
            ? `未入力の項目があります: ${missingLabels.join("、")}`
            : "雇用形態を選択すると必要な項目が表示されます。"}
      </div>

      {fieldErrors.length > 0 ? (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
          次の項目をご確認ください:{" "}
          {fieldErrors.map((f) => FIELD_ERROR_LABEL[f]).join("、")}
        </div>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">雇用形態</span>
        <select
          value={values.employmentType}
          onChange={(e) => update("employmentType", e.target.value)}
          onBlur={flushNow}
          className={inputClass("employment_type")}
        >
          <option value="">選択してください</option>
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EMPLOYMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">勤務先名</span>
        <input
          type="text"
          value={values.employerName}
          maxLength={200}
          onChange={(e) => update("employerName", e.target.value)}
          onBlur={flushNow}
          className={inputClass("employer_name")}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">入社年月</span>
        <input
          type="month"
          value={values.employmentStartedOn}
          onChange={(e) => update("employmentStartedOn", e.target.value)}
          onBlur={flushNow}
          className={inputClass("employment_started_on")}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">年収（額面・円）</span>
        <input
          type="text"
          inputMode="numeric"
          value={values.annualGrossIncomeYen}
          onChange={(e) => update("annualGrossIncomeYen", e.target.value)}
          onBlur={flushNow}
          className={inputClass("annual_gross_income_yen")}
          placeholder="例: 6000000"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">収入区分</span>
        <select
          value={values.incomeType}
          onChange={(e) => update("incomeType", e.target.value)}
          onBlur={flushNow}
          className={inputClass("income_type")}
        >
          <option value="">選択してください</option>
          {INCOME_TYPES.map((t) => (
            <option key={t} value={t}>
              {INCOME_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <div>
        <button
          type="button"
          onClick={flushNow}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          今すぐ保存
        </button>
      </div>
    </div>
  );
}
