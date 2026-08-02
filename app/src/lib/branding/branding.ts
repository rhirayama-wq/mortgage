/**
 * Phase 2A-W1: 法人別ブランディングの型・純粋バリデーション・テーマ導出。
 * 正本は 0006_phase2aw1_organization_branding.sql（表示名/色/ロゴ path の検証・監査）。
 * 依存ゼロの純粋関数（unit test 対象）。CSS へ値を直接連結しない（style injection 不可）。
 */

/** サービス標準ブランド（未設定 org のフォールバック。既存表示に合わせる）。 */
export const DEFAULT_BRAND = {
  /** 表示名は organization 名へフォールバックするため定数は最終手段のみ。 */
  displayName: "住宅ローン",
  /** 既存 UI の primary（slate-900）。新色を発明しない。 */
  primaryColorHex: "#0f172a",
  /** 標準ロゴは持たない（表示名テキストへフォールバック）。 */
  logoStoragePath: null as string | null,
} as const;

export const BRANDING_LIMITS = {
  displayNameMax: 100,
  logoMaxBytes: 2 * 1024 * 1024, // 2MB
} as const;

export const ALLOWED_LOGO_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export type AllowedLogoMime = (typeof ALLOWED_LOGO_MIME)[number];
/** 拡張子は保存 path に使う正規形（jpg/jpeg は jpeg として MIME 判定、path では jpg/jpeg 双方許容）。 */
export const ALLOWED_LOGO_EXT = ["png", "jpg", "jpeg", "webp"] as const;
export type AllowedLogoExt = (typeof ALLOWED_LOGO_EXT)[number];

export const LOGO_BUCKET = "org-branding";

const HEX_RE = /^#[0-9a-f]{6}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---------------------------------------------------------------------------
// 表示名・色（6桁 HEX のみ・小文字固定・任意 CSS/関数/var/url を排除）
// ---------------------------------------------------------------------------

/** 表示名を正規化（trim・空は null）。1..100 を超えると null 以外で error。 */
export function normalizeDisplayName(input: string | null | undefined): {
  value: string | null;
  error: "too_long" | null;
} {
  const t = (input ?? "").trim();
  if (t.length === 0) return { value: null, error: null };
  if (t.length > BRANDING_LIMITS.displayNameMax) return { value: null, error: "too_long" };
  return { value: t, error: null };
}

/**
 * メインカラーを正規化（trim→lowercase）。6桁 HEX のみ許可。
 * alpha(8桁)/3桁/`rgb(...)`/`var(...)`/`url(...)`/任意文字列はすべて不正。空は null。
 */
export function normalizePrimaryColor(input: string | null | undefined): {
  value: string | null;
  error: "invalid" | null;
} {
  const t = (input ?? "").trim().toLowerCase();
  if (t.length === 0) return { value: null, error: null };
  if (!HEX_RE.test(t)) return { value: null, error: "invalid" };
  return { value: t, error: null };
}

export function isValidPrimaryColor(input: string): boolean {
  return HEX_RE.test(input.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// テーマトークン導出（単一 HEX → 4 変数）。WCAG 相対輝度でコントラスト判定。
// ---------------------------------------------------------------------------

export interface ThemeTokens {
  primary: string;
  primaryHover: string;
  primarySoft: string;
  onPrimary: string;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** sRGB チャンネル(0..255) → 線形化(0..1)。 */
function channelLinear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG 相対輝度 (0..1)。 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b)
  );
}

/** WCAG コントラスト比 (1..21)。 */
export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** primary を白へ ratio 混色（0=primary, 1=white）。 */
function mixWithWhite(hex: string, ratio: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * ratio,
    g + (255 - g) * ratio,
    b + (255 - b) * ratio,
  );
}

/** primary を黒へ ratio 混色（0=primary, 1=black）。 */
function mixWithBlack(hex: string, ratio: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - ratio), g * (1 - ratio), b * (1 - ratio));
}

/**
 * 検証済み HEX から 4 トークンを決定的に導出する。
 * - onPrimary: 白 or 濃色(#0f172a) のうちコントラストが高い方（可読性を保証）。
 * - hover: 明るい色は暗く、暗い色は少し明るくして視認差を確保。
 * - soft: 白へ強く混色した淡い branded 背景。
 * 不正入力はデフォルト primary を用いる（例外を投げない）。
 */
export function deriveThemeTokens(primaryInput: string): ThemeTokens {
  const primary = isValidPrimaryColor(primaryInput)
    ? primaryInput.trim().toLowerCase()
    : DEFAULT_BRAND.primaryColorHex;
  const lum = relativeLuminance(primary);
  const onPrimary =
    contrastRatio(primary, "#ffffff") >= contrastRatio(primary, "#0f172a")
      ? "#ffffff"
      : "#0f172a";
  // 明るい primary は黒へ、暗い primary は白へ寄せて hover の差を出す。
  const primaryHover = lum > 0.5 ? mixWithBlack(primary, 0.12) : mixWithWhite(primary, 0.14);
  const primarySoft = mixWithWhite(primary, 0.88);
  return { primary, primaryHover, primarySoft, onPrimary };
}

// ---------------------------------------------------------------------------
// ロゴ: MIME / magic bytes / サイズ / 拡張子 / object path
// ---------------------------------------------------------------------------

export type DetectedImage = "png" | "jpeg" | "webp";

/** 先頭バイト列から実体を判定（クライアント申告 MIME は信用しない）。 */
export function detectImageType(bytes: Uint8Array): DetectedImage | null {
  if (bytes.length >= 8) {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    ) {
      return "png";
    }
  }
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  // WebP: "RIFF"...."WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function mimeForDetected(t: DetectedImage): AllowedLogoMime {
  return t === "png" ? "image/png" : t === "jpeg" ? "image/jpeg" : "image/webp";
}

/** 保存拡張子（jpeg→jpg に正規化）。 */
export function extForDetected(t: DetectedImage): "png" | "jpg" | "webp" {
  return t === "png" ? "png" : t === "jpeg" ? "jpg" : "webp";
}

export type LogoValidationError =
  | "empty"
  | "too_large"
  | "unsupported_mime"
  | "unsupported_extension"
  | "magic_mismatch";

export interface LogoValidationInput {
  size: number;
  declaredMime: string;
  filename: string;
  head: Uint8Array; // 先頭バイト（>=12 推奨）
}

export interface LogoValidationResult {
  ok: boolean;
  error?: LogoValidationError;
  detected?: DetectedImage;
  mime?: AllowedLogoMime;
  ext?: "png" | "jpg" | "webp";
}

const EXT_RE = /\.([a-z0-9]+)$/i;

/** サーバー側でサイズ・拡張子・宣言 MIME・magic bytes をすべて検証する。 */
export function validateLogoFile(input: LogoValidationInput): LogoValidationResult {
  if (input.size <= 0) return { ok: false, error: "empty" };
  if (input.size > BRANDING_LIMITS.logoMaxBytes) return { ok: false, error: "too_large" };

  const declared = input.declaredMime.trim().toLowerCase();
  if (!(ALLOWED_LOGO_MIME as readonly string[]).includes(declared)) {
    return { ok: false, error: "unsupported_mime" };
  }
  const m = EXT_RE.exec(input.filename.trim().toLowerCase());
  const ext = m ? m[1] : "";
  if (!(ALLOWED_LOGO_EXT as readonly string[]).includes(ext)) {
    return { ok: false, error: "unsupported_extension" };
  }
  const detected = detectImageType(input.head);
  if (detected === null) return { ok: false, error: "magic_mismatch" };
  // 宣言 MIME と実体の一致（SVG/GIF 偽装や MIME 詐称を拒否）。
  if (mimeForDetected(detected) !== declared) {
    return { ok: false, error: "magic_mismatch" };
  }
  return {
    ok: true,
    detected,
    mime: mimeForDetected(detected),
    ext: extForDetected(detected),
  };
}

/** object path を生成（{org_id}/{uuid}.{ext}）。uuid は呼出側の crypto.randomUUID()。 */
export function buildLogoObjectPath(
  organizationId: string,
  randomUuid: string,
  ext: "png" | "jpg" | "webp",
): string {
  return `${organizationId}/${randomUuid}.${ext}`;
}

/** object path の安全性検証（先頭=org_id・乱数 UUID・拡張子限定・`..`/先頭 slash/SVG を排除）。 */
export function isValidLogoObjectPath(path: string, organizationId: string): boolean {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) return false;
  const segs = path.split("/");
  if (segs.length !== 2) return false;
  if (segs[0] !== organizationId) return false;
  const fm = EXT_RE.exec(segs[1]);
  if (!fm) return false;
  const ext = fm[1].toLowerCase();
  if (!["png", "jpg", "jpeg", "webp"].includes(ext)) return false;
  const base = segs[1].slice(0, segs[1].length - (ext.length + 1));
  return UUID_RE.test(base);
}

/** 既知 bucket の public URL を生成（内部秘密を含めない）。baseUrl は NEXT_PUBLIC_SUPABASE_URL。 */
export function buildLogoPublicUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${LOGO_BUCKET}/${path}`;
}
