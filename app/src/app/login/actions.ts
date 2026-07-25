"use server";

/**
 * Magic Link 送信 Server Action（CLAUDE.md §17）
 * - ブラウザから Supabase を直接呼ばず、ここへ集約する
 * - メールはサーバー側で検証・trim・小文字化
 * - shouldCreateUser: false を維持（未登録メールからの自動ユーザー作成禁止）
 * - 登録済み / 未登録を応答から区別できない共通応答
 * - Supabase 内部エラーを画面へ出さない
 * - 再送クールダウン（Cookie ベース、60秒）
 */

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeEmail, isValidEmail } from "@/lib/auth/validators";
import { getSafeInternalPath } from "@/lib/auth/safe-next";
import { appOrigin } from "@/lib/env";

const COOLDOWN_COOKIE = "ml_cooldown_until";
const COOLDOWN_MS = 60_000;

export async function sendMagicLink(formData: FormData): Promise<void> {
  const email = normalizeEmail(formData.get("email"));
  const next = getSafeInternalPath(formData.get("next"));
  const nextQuery = next !== "/" ? `&next=${encodeURIComponent(next)}` : "";

  if (!isValidEmail(email)) {
    redirect(`/login?e=invalid${nextQuery}`);
  }

  const cookieStore = await cookies();
  const cooldownUntil = Number(cookieStore.get(COOLDOWN_COOKIE)?.value ?? "0");
  if (Number.isFinite(cooldownUntil) && Date.now() < cooldownUntil) {
    redirect(`/login?e=cooldown${nextQuery}`);
  }

  const supabase = await createSupabaseServerClient();
  const callbackUrl = `${appOrigin()}/auth/callback${
    next !== "/" ? `?next=${encodeURIComponent(next)}` : ""
  }`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: callbackUrl,
    },
  });

  if (error) {
    // 未登録メール等のエラーでも応答を変えない（アカウント列挙防止）。
    // ログには安全な識別子のみ（HTTP status / エラー code）。
    // メールアドレス・本文・token・メッセージ全文は出さない（PII / 内部詳細のため）。
    const status = (error as { status?: number }).status ?? "unknown";
    const code = (error as { code?: string }).code ?? "unknown";
    console.error(
      `[login] magic link send failed status=${status} code=${code}`,
    );
  }

  cookieStore.set(COOLDOWN_COOKIE, String(Date.now() + COOLDOWN_MS), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.ceil(COOLDOWN_MS / 1000),
    path: "/login",
  });

  redirect(`/login?sent=1${nextQuery}`);
}
