/**
 * Phase 2A-W1: ブランディングのサーバー側読み取り（Server Component / layout 専用）。
 * - スタッフ(自 org active member)は RLS 経由で organization_branding を直接 SELECT。
 * - 顧客は case-scoped safe RPC（app_get_customer_case_public_branding）経由で公開3項目のみ。
 *   内部 path は server 内で消費し、React へは完成済み URL だけ渡す。
 * - 未設定はアプリ定数へフォールバック（行複製しない）。テナント混線を避けるため
 *   organization/case ごとに解決し、モジュールスコープの共有キャッシュへ入れない。
 */

import { createSupabaseServerClient } from "../supabase/server";
import { supabaseUrl } from "../env";
import { DataAccessError } from "../auth/errors";
import {
  DEFAULT_BRAND,
  deriveThemeTokens,
  buildLogoPublicUrl,
  isValidLogoObjectPath,
  type ThemeTokens,
} from "./branding";

export interface ResolvedBrand {
  displayName: string;
  primaryColorHex: string;
  logoUrl: string | null;
  tokens: ThemeTokens;
}

/** 設定画面用の現在値（override は null 可・楽観ロック用 updatedAt つき）。 */
export interface OrgBrandingSettings {
  displayName: string | null;
  primaryColorHex: string | null;
  logoPath: string | null;
  logoUrl: string | null;
  updatedAt: string | null;
}

function logoUrlFromPath(path: string | null): string | null {
  if (!path) return null;
  // path はサービス管理下の値だが、念のため形は確認しない（org 不明のため）— server 内でのみ URL 化。
  return buildLogoPublicUrl(supabaseUrl(), path);
}

function resolve(
  displayName: string | null,
  primaryColorHex: string | null,
  logoPath: string | null,
  fallbackName: string,
): ResolvedBrand {
  const name =
    displayName && displayName.trim().length > 0
      ? displayName
      : fallbackName && fallbackName.trim().length > 0
        ? fallbackName
        : DEFAULT_BRAND.displayName;
  const color = primaryColorHex ?? DEFAULT_BRAND.primaryColorHex;
  return {
    displayName: name,
    primaryColorHex: color,
    logoUrl: logoUrlFromPath(logoPath),
    tokens: deriveThemeTokens(color),
  };
}

/** スタッフ設定画面: 自 org の現在の override を取得（RLS: 自 org active member のみ）。 */
export async function loadOrgBrandingSettings(
  organizationId: string,
): Promise<OrgBrandingSettings> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organization_branding")
    .select("display_name, logo_storage_path, primary_color_hex, updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new DataAccessError("failed to load organization branding");
  const path =
    typeof data?.logo_storage_path === "string" ? data.logo_storage_path : null;
  return {
    displayName: typeof data?.display_name === "string" ? data.display_name : null,
    primaryColorHex:
      typeof data?.primary_color_hex === "string" ? data.primary_color_hex : null,
    logoPath: path,
    logoUrl: logoUrlFromPath(path),
    updatedAt: typeof data?.updated_at === "string" ? data.updated_at : null,
  };
}

/** 法人アプリ layout 用の解決済みブランド（未設定は org 名 → 定数へフォールバック）。 */
export async function loadOrgResolvedBrand(
  organizationId: string,
  fallbackName: string,
): Promise<ResolvedBrand> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organization_branding")
    .select("display_name, logo_storage_path, primary_color_hex")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new DataAccessError("failed to load organization branding");
  return resolve(
    typeof data?.display_name === "string" ? data.display_name : null,
    typeof data?.primary_color_hex === "string" ? data.primary_color_hex : null,
    typeof data?.logo_storage_path === "string" ? data.logo_storage_path : null,
    fallbackName,
  );
}

/**
 * 顧客案件 layout 用の解決済みブランド（case-scoped safe RPC）。
 * 本人が participant でない/未設定なら定数へフォールバック（display_name は汎用既定）。
 */
export async function loadCaseResolvedBrand(caseId: string): Promise<ResolvedBrand> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "app_get_customer_case_public_branding",
    { p_case_id: caseId },
  );
  if (error) throw new DataAccessError("failed to load case branding");
  const row = ((data as unknown[] | null) ?? [])[0] as
    | Record<string, unknown>
    | undefined;
  const path =
    typeof row?.logo_storage_path === "string" ? row.logo_storage_path : null;
  return resolve(
    typeof row?.display_name === "string" ? row.display_name : null,
    typeof row?.primary_color_hex === "string" ? row.primary_color_hex : null,
    // 顧客経路でも server 内でのみ URL 化。念のため path 形は URL 化前に確認しない
    // （org 不明。値はサービス管理下）。表示のみ。
    path,
    DEFAULT_BRAND.displayName,
  );
}

/** 障害/未設定時の安全なフォールバック（例外を投げずに標準ブランドを返す）。 */
export function defaultResolvedBrand(fallbackName: string): ResolvedBrand {
  return resolve(null, null, null, fallbackName);
}

/** ThemeTokens を CSS variables の style オブジェクトへ（値は検証済み HEX のみ）。 */
export function brandStyleVars(tokens: ThemeTokens): Record<string, string> {
  return {
    "--brand-primary": tokens.primary,
    "--brand-primary-hover": tokens.primaryHover,
    "--brand-primary-soft": tokens.primarySoft,
    "--brand-on-primary": tokens.onPrimary,
  };
}

export { isValidLogoObjectPath };
