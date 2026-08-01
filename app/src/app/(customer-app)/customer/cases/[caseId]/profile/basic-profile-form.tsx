"use client";

/**
 * 顧客基本情報フォーム（クライアント）。
 * - デバウンス(800ms)＋blur でオートセーブし、Server Action saveBasicProfile を呼ぶ。
 * - 保存はシリアライズし、常に最新値を送る（古い保存が新しい値を上書きしない）。
 * - PII 値は console / URL へ出さない。認可・保存の正本はサーバー(RPC)側。
 * - 編集不可（案件が opened/inputting 以外）の場合は読み取り専用表示にする。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  validateBasicProfile,
  type BasicApplicantProfileInput,
  type BasicProfileFieldError,
} from "@/lib/customer-cases/profile";
import { saveBasicProfile } from "./actions";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const FIELD_ERROR_LABEL: Record<BasicProfileFieldError, string> = {
  email: "メールアドレス",
  birth_date: "生年月日",
  full_name: "氏名",
  full_name_kana: "氏名（カナ）",
  phone: "電話番号",
  postal_code: "郵便番号",
  address: "住所",
};

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ja-JP");
}

export function BasicProfileForm({
  applicantId,
  initial,
  editable,
}: {
  applicantId: string;
  initial: BasicApplicantProfileInput;
  editable: boolean;
}) {
  const [values, setValues] = useState<BasicApplicantProfileInput>(initial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<BasicProfileFieldError[]>([]);

  const valuesRef = useRef(values);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);

  const runSave = useCallback(async () => {
    if (!editable) return;
    const errs = validateBasicProfile(valuesRef.current);
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
      const res = await saveBasicProfile(applicantId, valuesRef.current);
      if (res.ok) {
        setStatus("saved");
        setSavedAt(res.savedAt);
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

  const update = (field: keyof BasicApplicantProfileInput, value: string) => {
    setValues((v) => {
      const nv = { ...v, [field]: value };
      valuesRef.current = nv;
      return nv;
    });
    scheduleSave();
  };

  const hasFieldError = (f: BasicProfileFieldError) => fieldErrors.includes(f);
  const inputClass = (f: BasicProfileFieldError) =>
    `rounded border px-3 py-2 text-sm ${
      hasFieldError(f) ? "border-red-400 bg-red-50" : "border-slate-300"
    }`;

  if (!editable) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        この案件は現在、基本情報を編集できない状態です。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="text-xs"
        aria-live="polite"
        data-testid="autosave-status"
      >
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

      {fieldErrors.length > 0 ? (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
          次の項目をご確認ください:{" "}
          {fieldErrors.map((f) => FIELD_ERROR_LABEL[f]).join("、")}
        </div>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">氏名</span>
        <input
          type="text"
          value={values.fullName}
          maxLength={200}
          onChange={(e) => update("fullName", e.target.value)}
          onBlur={flushNow}
          className={inputClass("full_name")}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">氏名（カナ）</span>
        <input
          type="text"
          value={values.fullNameKana}
          maxLength={200}
          onChange={(e) => update("fullNameKana", e.target.value)}
          onBlur={flushNow}
          className={inputClass("full_name_kana")}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">生年月日</span>
        <input
          type="date"
          value={values.birthDate}
          onChange={(e) => update("birthDate", e.target.value)}
          onBlur={flushNow}
          className={inputClass("birth_date")}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">メールアドレス</span>
        <input
          type="email"
          value={values.email}
          maxLength={254}
          onChange={(e) => update("email", e.target.value)}
          onBlur={flushNow}
          className={inputClass("email")}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">電話番号</span>
        <input
          type="tel"
          value={values.phone}
          maxLength={50}
          onChange={(e) => update("phone", e.target.value)}
          onBlur={flushNow}
          className={inputClass("phone")}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">郵便番号</span>
        <input
          type="text"
          value={values.postalCode}
          maxLength={20}
          onChange={(e) => update("postalCode", e.target.value)}
          onBlur={flushNow}
          className={inputClass("postal_code")}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">住所</span>
        <textarea
          value={values.address}
          maxLength={500}
          rows={2}
          onChange={(e) => update("address", e.target.value)}
          onBlur={flushNow}
          className={inputClass("address")}
        />
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
