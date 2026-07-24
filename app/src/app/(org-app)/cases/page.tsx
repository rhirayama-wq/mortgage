/**
 * /cases — 法人アプリ仮トップ（Phase 2 で案件一覧に置き換える）。
 * 認可は (org-app)/layout.tsx が実施済み。
 */

export const dynamic = "force-dynamic";

export default function CasesPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-3 text-lg font-semibold">案件一覧（準備中）</h1>
      <p className="text-sm text-slate-600">
        Phase 2 で顧客案件の作成・入力・住宅ローン検索がここに追加されます。
      </p>
    </div>
  );
}
