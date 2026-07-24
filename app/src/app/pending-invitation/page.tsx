/**
 * /pending-invitation — 本人の invited membership の表示・受諾（認証済み本人のみ）。
 * RLS により本人の membership しか取得できず、受諾は DB 業務関数が再検証する。
 */

import { redirect } from "next/navigation";
import { requireAuthenticated } from "@/lib/auth/require";
import {
  invitedMemberships,
  decideLanding,
  routeForDecision,
} from "@/lib/auth/access";
import { SignoutButton } from "@/components/signout-button";
import { acceptInvitation } from "./actions";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PendingInvitationPage({ searchParams }: PageProps) {
  const ctx = await requireAuthenticated();
  const params = await searchParams;
  const hasError = params.e === "1";

  const invitations = invitedMemberships(ctx);
  if (invitations.length === 0) {
    redirect(routeForDecision(decideLanding(ctx)));
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <h1 className="mb-3 text-lg font-semibold">招待が届いています</h1>
      <p className="mb-4 text-sm text-slate-600">
        以下の法人から招待されています。参加する場合は「招待を受諾」を押してください。
      </p>

      {hasError ? (
        <div
          className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          招待を受諾できませんでした。招待の状態が変更された可能性があります。
          問題が続く場合は法人の管理者にお問い合わせください。
        </div>
      ) : null}

      <ul className="mb-6 flex flex-col gap-3">
        {invitations.map((m) => (
          <li
            key={m.membershipId}
            className="flex items-center justify-between rounded border border-slate-200 bg-white p-4"
          >
            <div>
              <div className="text-sm font-medium">
                {m.organizationName ?? "（法人名を取得できません）"}
              </div>
              <div className="text-xs text-slate-500">
                ロール:{" "}
                {m.role === "ORGANIZATION_ADMIN" ? "管理者" : "営業担当"}
              </div>
            </div>
            <form action={acceptInvitation}>
              <input type="hidden" name="membershipId" value={m.membershipId} />
              <button
                type="submit"
                className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
              >
                招待を受諾
              </button>
            </form>
          </li>
        ))}
      </ul>
      <SignoutButton />
    </main>
  );
}
