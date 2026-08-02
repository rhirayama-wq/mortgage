/**
 * /settings/branding — 法人ブランディング管理（ORGANIZATION_ADMIN のみ）。
 * 認可: (org-app) layout が active membership を担保。ここで ORG_ADMIN 以外は締め出す。
 * SALES_USER 用の read-only 版は作らない（初期フェーズ）。
 */

import { redirect } from "next/navigation";
import { requireOrgAccess, orErrorPage } from "@/lib/auth/require";
import { loadOrgBrandingSettings } from "@/lib/branding/queries";
import { BrandingForm } from "./branding-form";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, { kind: "ok" | "error"; text: string }> = {
  "saved=1": { kind: "ok", text: "ブランド設定を保存しました。" },
  "logo=1": { kind: "ok", text: "ロゴを更新しました。" },
  "removed=1": { kind: "ok", text: "ロゴを削除しました。" },
  "reset=1": { kind: "ok", text: "標準設定へ戻しました。" },
  "e=validation": { kind: "error", text: "入力内容をご確認ください。" },
  "e=forbidden": { kind: "error", text: "この操作を行う権限がありません。" },
  "e=stale": {
    kind: "error",
    text: "他の画面で更新されています。最新の内容を読み込んで再度お試しください。",
  },
  "e=logo": {
    kind: "error",
    text: "ロゴを保存できませんでした。PNG / JPEG / WebP・2MB 以下でお試しください。",
  },
  "e=save": { kind: "error", text: "保存に失敗しました。時間をおいて再度お試しください。" },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BrandingSettingsPage({ searchParams }: PageProps) {
  const { role, organizationId } = await requireOrgAccess();
  if (role !== "ORGANIZATION_ADMIN") {
    redirect("/cases");
  }
  const settings = await orErrorPage(() => loadOrgBrandingSettings(organizationId));

  const sp = await searchParams;
  const noticeKey =
    Object.keys(NOTICES).find((k) => {
      const [key, val] = k.split("=");
      return String(sp[key] ?? "") === val;
    }) ?? "";
  const notice = NOTICES[noticeKey];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">ブランディング</h1>
        <p className="mt-1 text-sm text-slate-600">
          自社の表示名・ロゴ・メインカラーを設定できます。設定は法人スタッフ画面と、
          お客様の案件画面に反映されます。
        </p>
      </div>

      {notice ? (
        <div
          className={
            notice.kind === "ok"
              ? "rounded border border-green-300 bg-green-50 p-2 text-xs text-green-800"
              : "rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800"
          }
          role={notice.kind === "error" ? "alert" : undefined}
        >
          {notice.text}
        </div>
      ) : null}

      <BrandingForm
        initialDisplayName={settings.displayName ?? ""}
        initialColor={settings.primaryColorHex ?? ""}
        logoUrl={settings.logoUrl}
        updatedAt={settings.updatedAt}
      />
    </div>
  );
}
