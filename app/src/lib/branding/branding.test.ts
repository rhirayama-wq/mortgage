import { test } from "vitest";
import assert from "node:assert/strict";
import {
  normalizeDisplayName,
  normalizePrimaryColor,
  isValidPrimaryColor,
  deriveThemeTokens,
  relativeLuminance,
  contrastRatio,
  detectImageType,
  validateLogoFile,
  buildLogoObjectPath,
  isValidLogoObjectPath,
  buildLogoPublicUrl,
  extForDetected,
  mimeForDetected,
} from "./branding";
import { toSafeBrandingError, classifyBrandingError } from "./errors";

const pngHead = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpegHead = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const webpHead = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const svgHead = new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x20, 0, 0, 0, 0, 0, 0, 0]); // "<svg "

test("W1-UNIT-01: valid HEX accepted, normalized to lowercase", () => {
  assert.deepEqual(normalizePrimaryColor("#AABBCC"), { value: "#aabbcc", error: null });
  assert.equal(isValidPrimaryColor("#0f172a"), true);
  assert.deepEqual(normalizePrimaryColor("  #12ab9F "), { value: "#12ab9f", error: null });
  assert.deepEqual(normalizePrimaryColor(""), { value: null, error: null });
});

test("W1-UNIT-02: invalid HEX / CSS injection rejected", () => {
  for (const bad of [
    "#fff",
    "#12345",
    "#1234567",
    "#12345678",
    "red",
    "rgb(0,0,0)",
    "var(--x)",
    "url(http://x)",
    "#00000; background:url(x)",
    "#zzzzzz",
    "#0f172a;",
  ]) {
    assert.deepEqual(
      normalizePrimaryColor(bad),
      { value: null, error: "invalid" },
      `should reject ${bad}`,
    );
    assert.equal(isValidPrimaryColor(bad), false, `isValid should reject ${bad}`);
  }
});

test("W1-UNIT-03: display name normalize (trim, empty->null, length)", () => {
  assert.deepEqual(normalizeDisplayName("  架空不動産  "), { value: "架空不動産", error: null });
  assert.deepEqual(normalizeDisplayName("   "), { value: null, error: null });
  assert.deepEqual(normalizeDisplayName("あ".repeat(100)), {
    value: "あ".repeat(100),
    error: null,
  });
  assert.deepEqual(normalizeDisplayName("あ".repeat(101)), { value: null, error: "too_long" });
});

test("W1-UNIT-04: theme token derivation is deterministic and structured", () => {
  const t = deriveThemeTokens("#2563eb");
  assert.equal(t.primary, "#2563eb");
  assert.match(t.primaryHover, /^#[0-9a-f]{6}$/);
  assert.match(t.primarySoft, /^#[0-9a-f]{6}$/);
  assert.ok(t.onPrimary === "#ffffff" || t.onPrimary === "#0f172a");
  // 決定的: 同入力→同出力
  assert.deepEqual(deriveThemeTokens("#2563eb"), t);
  // 不正入力はデフォルト primary へフォールバック（例外を投げない）
  assert.equal(deriveThemeTokens("red").primary, "#0f172a");
});

test("W1-UNIT-05: on-primary picks higher-contrast foreground (WCAG)", () => {
  // 濃色 primary → 白文字
  assert.equal(deriveThemeTokens("#0f172a").onPrimary, "#ffffff");
  // 明色 primary → 濃色文字
  assert.equal(deriveThemeTokens("#fde047").onPrimary, "#0f172a");
  // 選ばれた on-primary は他方より高コントラスト
  const p = "#2563eb";
  const chosen = deriveThemeTokens(p).onPrimary;
  const other = chosen === "#ffffff" ? "#0f172a" : "#ffffff";
  assert.ok(contrastRatio(p, chosen) >= contrastRatio(p, other));
  // luminance 単調性のサニティ
  assert.ok(relativeLuminance("#ffffff") > relativeLuminance("#000000"));
});

test("W1-UNIT-06: magic bytes detect PNG/JPEG/WebP; SVG/unknown rejected", () => {
  assert.equal(detectImageType(pngHead), "png");
  assert.equal(detectImageType(jpegHead), "jpeg");
  assert.equal(detectImageType(webpHead), "webp");
  assert.equal(detectImageType(svgHead), null);
  assert.equal(detectImageType(new Uint8Array([0, 1, 2])), null);
  assert.equal(mimeForDetected("png"), "image/png");
  assert.equal(extForDetected("jpeg"), "jpg");
});

test("W1-UNIT-07: validateLogoFile enforces size/mime/ext/magic", () => {
  // valid PNG
  assert.deepEqual(
    validateLogoFile({ size: 1000, declaredMime: "image/png", filename: "logo.png", head: pngHead }),
    { ok: true, detected: "png", mime: "image/png", ext: "png" },
  );
  // valid JPEG (filename .jpg)
  assert.equal(
    validateLogoFile({ size: 1000, declaredMime: "image/jpeg", filename: "a.jpg", head: jpegHead }).ok,
    true,
  );
  // oversized
  assert.deepEqual(
    validateLogoFile({ size: 3 * 1024 * 1024, declaredMime: "image/png", filename: "l.png", head: pngHead }),
    { ok: false, error: "too_large" },
  );
  // SVG declared image/svg+xml -> unsupported mime
  assert.deepEqual(
    validateLogoFile({ size: 100, declaredMime: "image/svg+xml", filename: "l.svg", head: svgHead }),
    { ok: false, error: "unsupported_mime" },
  );
  // SVG bytes but declared png + .png -> magic mismatch
  assert.deepEqual(
    validateLogoFile({ size: 100, declaredMime: "image/png", filename: "l.png", head: svgHead }),
    { ok: false, error: "magic_mismatch" },
  );
  // MIME/real mismatch (declares png, bytes jpeg)
  assert.deepEqual(
    validateLogoFile({ size: 100, declaredMime: "image/png", filename: "l.png", head: jpegHead }),
    { ok: false, error: "magic_mismatch" },
  );
  // bad extension
  assert.deepEqual(
    validateLogoFile({ size: 100, declaredMime: "image/png", filename: "l.txt", head: pngHead }),
    { ok: false, error: "unsupported_extension" },
  );
});

test("W1-UNIT-08: object path build/validate (tenant-scoped, no traversal, no SVG)", () => {
  const org = "11111111-1111-4111-8111-111111111111";
  const uuid = "22222222-2222-4222-8222-222222222222";
  const p = buildLogoObjectPath(org, uuid, "png");
  assert.equal(p, `${org}/${uuid}.png`);
  assert.equal(isValidLogoObjectPath(p, org), true);
  // 他 org
  assert.equal(isValidLogoObjectPath(p, "33333333-3333-4333-8333-333333333333"), false);
  // traversal / leading slash / svg / nested
  assert.equal(isValidLogoObjectPath(`${org}/../secret.png`, org), false);
  assert.equal(isValidLogoObjectPath(`/${org}/${uuid}.png`, org), false);
  assert.equal(isValidLogoObjectPath(`${org}/${uuid}.svg`, org), false);
  assert.equal(isValidLogoObjectPath(`${org}/a/${uuid}.png`, org), false);
  assert.equal(isValidLogoObjectPath(`${org}/not-a-uuid.png`, org), false);
});

test("W1-UNIT-09: public URL generation (no secrets, known bucket)", () => {
  const url = buildLogoPublicUrl(
    "https://local.supabase.test/",
    "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png",
  );
  assert.equal(
    url,
    "https://local.supabase.test/storage/v1/object/public/org-branding/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png",
  );
});

test("W1-UNIT-10: error mapping to safe codes", () => {
  assert.equal(toSafeBrandingError("not_authorized"), "not_authorized");
  assert.equal(toSafeBrandingError("branding_stale_update"), "stale_update");
  assert.equal(toSafeBrandingError("invalid_branding_color"), "validation_error");
  assert.equal(toSafeBrandingError("invalid_branding_display_name"), "validation_error");
  assert.equal(toSafeBrandingError("invalid_branding_logo_path"), "logo_invalid");
  assert.equal(toSafeBrandingError("something_unknown"), "unexpected_error");
  assert.equal(classifyBrandingError("branding_stale_update"), "branding_stale_update");
});
