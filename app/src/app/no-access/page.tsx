/**
 * /no-access — 所属なし・suspended/left ユーザー向け（認証済み専用）。
 * DB / Auth 障害はここへ来ない（/error と厳密に区別: CLAUDE.md §18, §34）。
 */

import { redirect } from "next/navigation";
import { requireAuthenticated } from "@/lib/auth/require";
import { decideLanding, routeForDecision } from "@/lib/auth/access";
import { SignoutButton } from "@/components/signout-button";

export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  const ctx = await requireAuthenticated();

  // アクセス可能な行き先があるユーザーはそちらへ
  const decision = decideLanding(ctx);
  if (decision.kind !== "no-access") {
    redirect(routeForDecision(decision));
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <h1 className="mb-3 text-lg font-semibold">利用できる法人がありません</h1>
      <p className="mb-6 text-sm text-slate-600">
        現在、このアカウントで利用可能な法人がないか、所属が停止・終了しています。
        利用を開始するには、所属予定の法人の管理者に招待を依頼してください。
      </p>
      <SignoutButton />
    </main>
  );
}
