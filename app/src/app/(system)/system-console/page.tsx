/**
 * /system-console — SYSTEM_ADMIN 仮トップ。
 * 法人管理・共通マスタ管理は後続フェーズで追加する。
 * 顧客案件・財務情報は SYSTEM_ADMIN でも当然には閲覧できない（CLAUDE.md §8.3）。
 */

export const dynamic = "force-dynamic";

export default function SystemConsolePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-3 text-lg font-semibold">システム管理（準備中）</h1>
      <p className="text-sm text-slate-600">
        法人管理・ユーザー管理・共通商品マスタ管理は後続フェーズで追加されます。
        顧客案件の閲覧には業務理由・追加権限確認・監査が必要です。
      </p>
    </div>
  );
}
