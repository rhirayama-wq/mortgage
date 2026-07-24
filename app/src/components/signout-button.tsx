/**
 * サインアウトボタン: POST フォーム（GET で状態変更しない）。
 * JS 不要のプレーンな form 送信。
 */

export function SignoutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
      >
        サインアウト
      </button>
    </form>
  );
}
