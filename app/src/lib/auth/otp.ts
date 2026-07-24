/**
 * callback で許可する OTP type の実行時検証（CLAUDE.md §17 / AUTH-07）
 * 通常ログイン callback は email / magiclink のみ。
 * recovery / invite / signup を通常ログインへ混在させない（用途別に分離する）。
 */

export const ALLOWED_LOGIN_OTP_TYPES = ["email", "magiclink"] as const;

export type LoginOtpType = (typeof ALLOWED_LOGIN_OTP_TYPES)[number];

export function parseLoginOtpType(value: unknown): LoginOtpType | null {
  if (value === "email" || value === "magiclink") return value;
  return null;
}
