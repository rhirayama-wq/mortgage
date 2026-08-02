"use server";

/**
 * Phase 2A-W1: 法人ブランディング Server Action 群。
 * - active ORGANIZATION_ADMIN のみ（サーバーで role 再確認 + RPC 側でも再認可）。
 * - organizationId はクライアント任せにせず認証コンテキストから導出。
 * - 業務テーブルへ直接書込しない。RPC 経由のみ。
 * - ロゴは magic bytes まで検証し、ユーザーセッションの Storage client で upload（service role 不使用）。
 * - Storage と DB は原子的でないため、DB 失敗時は新 object を補償削除、成功時は旧 object を best-effort 削除。
 * - 秘密（token/内部 path/binary）は画面/ログ/監査へ出さない。
 */

import { redirect } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/require";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  validateLogoFile,
  buildLogoObjectPath,
  normalizeDisplayName,
  normalizePrimaryColor,
  LOGO_BUCKET,
} from "@/lib/branding/branding";
import { toSafeBrandingError } from "@/lib/branding/errors";

const BASE = "/settings/branding";

async function requireAdmin(): Promise<{ organizationId: string }> {
  const { organizationId, role } = await requireOrgAccess();
  if (role !== "ORGANIZATION_ADMIN") {
    redirect(`${BASE}?e=forbidden`);
  }
  return { organizationId };
}

function expectedFrom(formData: FormData): string | null {
  const v = String(formData.get("expectedUpdatedAt") ?? "");
  return v.length > 0 ? v : null;
}

/** 表示名・メインカラーの保存。 */
export async function saveBranding(formData: FormData): Promise<void> {
  const { organizationId } = await requireAdmin();

  const nameRes = normalizeDisplayName(String(formData.get("displayName") ?? ""));
  const colorRes = normalizePrimaryColor(String(formData.get("primaryColor") ?? ""));
  if (nameRes.error || colorRes.error) {
    redirect(`${BASE}?e=validation`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("app_update_organization_branding", {
    p_organization_id: organizationId,
    p_display_name: nameRes.value,
    p_primary_color_hex: colorRes.value,
    p_expected_updated_at: expectedFrom(formData),
    p_correlation_id: crypto.randomUUID(),
  });
  if (error) {
    const code = toSafeBrandingError(error.message);
    console.error("[branding] save failed code=", code);
    redirect(`${BASE}?e=${code === "stale_update" ? "stale" : code === "not_authorized" ? "forbidden" : "save"}`);
  }
  redirect(`${BASE}?saved=1`);
}

/** ロゴのアップロード/差し替え。 */
export async function uploadLogo(formData: FormData): Promise<void> {
  const { organizationId } = await requireAdmin();

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${BASE}?e=logo`);
  }
  const f = file as File;
  const buf = new Uint8Array(await f.arrayBuffer());
  const check = validateLogoFile({
    size: f.size,
    declaredMime: f.type,
    filename: f.name,
    head: buf.subarray(0, 16),
  });
  if (!check.ok || !check.ext || !check.mime) {
    console.error("[branding] logo rejected error=", check.error);
    redirect(`${BASE}?e=logo`);
  }

  const path = buildLogoObjectPath(organizationId, crypto.randomUUID(), check.ext);
  const supabase = await createSupabaseServerClient();

  // 1) 新 object を upload（Storage RLS: active ORG_ADMIN の自 org フォルダのみ）。
  const up = await supabase.storage.from(LOGO_BUCKET).upload(path, buf, {
    contentType: check.mime,
    upsert: false,
    cacheControl: "3600",
  });
  if (up.error) {
    console.error("[branding] logo upload failed");
    redirect(`${BASE}?e=logo`);
  }

  // 2) DB へ path 登録。
  const { data, error } = await supabase.rpc("app_set_organization_branding_logo", {
    p_organization_id: organizationId,
    p_logo_path: path,
    p_expected_updated_at: expectedFrom(formData),
    p_correlation_id: crypto.randomUUID(),
  });
  if (error) {
    // 補償削除: DB 失敗時は新 object を削除（orphan 防止）。
    await supabase.storage.from(LOGO_BUCKET).remove([path]).catch(() => {});
    const code = toSafeBrandingError(error.message);
    console.error("[branding] logo db register failed code=", code);
    redirect(`${BASE}?e=${code === "stale_update" ? "stale" : "logo"}`);
  }

  // 3) 旧 object を best-effort 削除（失敗しても操作全体は成功扱い＝orphan は後続 GC 対象）。
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  const oldPath = typeof row?.old_logo_path === "string" ? row.old_logo_path : null;
  if (oldPath && oldPath !== path) {
    await supabase.storage.from(LOGO_BUCKET).remove([oldPath]).catch(() => {});
  }
  redirect(`${BASE}?logo=1`);
}

/** ロゴ削除（標準ロゴへフォールバック）。 */
export async function removeLogo(formData: FormData): Promise<void> {
  const { organizationId } = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("app_remove_organization_branding_logo", {
    p_organization_id: organizationId,
    p_expected_updated_at: expectedFrom(formData),
    p_correlation_id: crypto.randomUUID(),
  });
  if (error) {
    const code = toSafeBrandingError(error.message);
    console.error("[branding] logo remove failed code=", code);
    redirect(`${BASE}?e=${code === "stale_update" ? "stale" : "save"}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  const oldPath = typeof row?.old_logo_path === "string" ? row.old_logo_path : null;
  if (oldPath) {
    await supabase.storage.from(LOGO_BUCKET).remove([oldPath]).catch(() => {});
  }
  redirect(`${BASE}?removed=1`);
}

/** 標準設定へリセット（override 全解除）。 */
export async function resetBranding(): Promise<void> {
  const { organizationId } = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("app_reset_organization_branding", {
    p_organization_id: organizationId,
    p_correlation_id: crypto.randomUUID(),
  });
  if (error) {
    const code = toSafeBrandingError(error.message);
    console.error("[branding] reset failed code=", code);
    redirect(`${BASE}?e=save`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  const oldPath = typeof row?.old_logo_path === "string" ? row.old_logo_path : null;
  if (oldPath) {
    const supabase2 = await createSupabaseServerClient();
    await supabase2.storage.from(LOGO_BUCKET).remove([oldPath]).catch(() => {});
  }
  redirect(`${BASE}?reset=1`);
}
