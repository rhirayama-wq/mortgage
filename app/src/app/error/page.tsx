import Link from "next/link";
/**
 * /error — DB / RLS / Auth 取得エラーの汎用表示。
 * 内部詳細・スタック・Supabase エラーを表示しない（情報漏えい防止）。
 * 「所属なし」(no-access) とは明確に区別された障害用ページ。
 */

export const dynamic = "force-dynamic";

export default function ErrorPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <h1 className="mb-3 text-lg font-semibold">
        一時的な問題が発生しています
      </h1>
      <p className="mb-6 text-sm text-slate-600">
        現在、システムへのアクセスに問題が発生しています。しばらく待ってから
        再度お試しください。問題が続く場合は管理者にお問い合わせください。
      </p>
      <Link
        href="/"
        className="inline-block rounded border border-slate-300 px-4 py-2 text-center text-sm hover:bg-slate-100"
      >
        トップへ戻る
      </Link>
    </main>
  );
}
