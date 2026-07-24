/**
 * /login — Magic Link ログイン画面（公開）。
 * 送信は Server Action (actions.ts) へ集約。認証済みは middleware が / へ戻す。
 * 応答メッセージは登録有無を区別しない共通文言。
 */

import { sendMagicLink } from "./actions";
import { getSafeInternalPath } from "@/lib/auth/safe-next";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const sent = firstParam(params.sent) === "1";
  const errorKind = firstParam(params.e);
  const next = getSafeInternalPath(firstParam(params.next));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <h1 className="mb-2 text-xl font-semibold">ログイン</h1>
      <p className="mb-6 text-sm text-slate-600">
        登録済みのメールアドレスを入力してください。ログイン用リンクをお送りします。
      </p>

      {sent ? (
        <div
          className="mb-4 rounded border border-slate-300 bg-white p-3 text-sm"
          role="status"
          aria-live="polite"
        >
          入力されたメールアドレスが登録されている場合、ログイン用リンクを送信しました。
          メールをご確認ください。リンクの有効期限が切れた場合は、再度送信してください。
        </div>
      ) : null}

      {errorKind === "invalid" ? (
        <div
          className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          メールアドレスの形式が正しくありません。
        </div>
      ) : null}

      {errorKind === "cooldown" ? (
        <div
          className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
          role="alert"
        >
          送信間隔が短すぎます。しばらく待ってから再度お試しください。
        </div>
      ) : null}

      {errorKind === "link" ? (
        <div
          className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          ログインリンクが無効か、有効期限が切れています。お手数ですが、再度ログイン用リンクを送信してください。
        </div>
      ) : null}

      <form action={sendMagicLink} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium">
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder="you@example.co.jp"
          />
        </div>
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          ログイン用リンクを送信
        </button>
      </form>
    </main>
  );
}
