"use client";

/**
 * 法人ブランディング設定フォーム（クライアント）。
 * - 表示名・メインカラー・ロゴを編集。プレビューはブラウザ内のみ（保存前にグローバル反映しない）。
 * - メインカラーは color picker と HEX 入力を同期。検証は最終的にサーバー(RPC)が正本。
 * - semantic color（error/warning/success 等）はプレビューでも変更しない。
 * - 楽観ロック用に updatedAt を hidden で送る。
 */

import { useState } from "react";
import {
  isValidPrimaryColor,
  deriveThemeTokens,
  DEFAULT_BRAND,
} from "@/lib/branding/branding";
import { saveBranding, uploadLogo, removeLogo, resetBranding } from "./actions";

export function BrandingForm({
  initialDisplayName,
  initialColor,
  logoUrl,
  updatedAt,
}: {
  initialDisplayName: string;
  initialColor: string;
  logoUrl: string | null;
  updatedAt: string | null;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [color, setColor] = useState(initialColor);

  const colorValid = color.trim().length === 0 || isValidPrimaryColor(color);
  const effectiveColor = isValidPrimaryColor(color)
    ? color.trim().toLowerCase()
    : DEFAULT_BRAND.primaryColorHex;
  const tokens = deriveThemeTokens(effectiveColor);
  const pickerValue = isValidPrimaryColor(color)
    ? color.trim().toLowerCase()
    : DEFAULT_BRAND.primaryColorHex;
  const previewName =
    displayName.trim().length > 0 ? displayName : DEFAULT_BRAND.displayName;
  const expected = updatedAt ?? "";

  return (
    <div className="flex flex-col gap-6">
      {/* 現在のロゴ */}
      <section className="flex flex-col gap-2">
        <span className="text-sm font-medium">現在のロゴ</span>
        <div className="flex h-20 w-56 items-center justify-center rounded border border-slate-200 bg-white p-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={previewName}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-slate-400">標準（ロゴ未設定）</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={uploadLogo} className="flex items-center gap-2">
            <input type="hidden" name="expectedUpdatedAt" value={expected} />
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp"
              required
              className="text-xs"
            />
            <button
              type="submit"
              className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
            >
              ロゴを更新
            </button>
          </form>
          {logoUrl ? (
            <form action={removeLogo}>
              <input type="hidden" name="expectedUpdatedAt" value={expected} />
              <button
                type="submit"
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                ロゴを削除
              </button>
            </form>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">
          PNG / JPEG / WebP・2MB 以下。SVG は使用できません。
        </p>
      </section>

      {/* 表示名・カラー */}
      <form action={saveBranding} className="flex flex-col gap-4">
        <input type="hidden" name="expectedUpdatedAt" value={expected} />

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">表示名</span>
          <input
            type="text"
            name="displayName"
            value={displayName}
            maxLength={100}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="例: 架空不動産株式会社"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="text-xs text-slate-500">
            空欄にすると標準表示へ戻ります。
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">メインカラー</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={pickerValue}
              onChange={(e) => setColor(e.target.value)}
              aria-label="メインカラー picker"
              className="h-9 w-12 rounded border border-slate-300"
            />
            <input
              type="text"
              name="primaryColor"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#0f172a"
              className={`w-32 rounded border px-3 py-2 text-sm ${
                colorValid ? "border-slate-300" : "border-red-400 bg-red-50"
              }`}
            />
          </div>
          {!colorValid ? (
            <span className="text-xs text-red-700">
              #RRGGBB 形式（6桁）で入力してください。
            </span>
          ) : (
            <span className="text-xs text-slate-500">
              空欄にすると標準カラーへ戻ります。
            </span>
          )}
        </label>

        {/* プレビュー（ブラウザ内のみ・semantic color は不変） */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">プレビュー</span>
          <div
            className="rounded border border-slate-200"
            style={
              {
                "--brand-primary": tokens.primary,
                "--brand-primary-hover": tokens.primaryHover,
                "--brand-primary-soft": tokens.primarySoft,
                "--brand-on-primary": tokens.onPrimary,
              } as React.CSSProperties
            }
          >
            <div
              className="flex items-center gap-2 rounded-t px-3 py-2"
              style={{ background: "var(--brand-primary-soft)" }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={previewName} className="h-5 w-auto object-contain" />
              ) : null}
              <span className="text-sm font-semibold">{previewName}</span>
            </div>
            <div className="flex items-center gap-2 p-3">
              <button
                type="button"
                style={{
                  background: "var(--brand-primary)",
                  color: "var(--brand-on-primary)",
                }}
                className="rounded px-3 py-1.5 text-sm font-medium"
              >
                主要ボタン
              </button>
              <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">
                エラー表示（固定）
              </span>
              <span className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">
                成功表示（固定）
              </span>
            </div>
          </div>
        </div>

        <div>
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            保存
          </button>
        </div>
      </form>

      {/* 標準へ戻す */}
      <form action={resetBranding} className="border-t border-slate-100 pt-3">
        <button
          type="submit"
          className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          標準設定へ戻す
        </button>
      </form>
    </div>
  );
}
