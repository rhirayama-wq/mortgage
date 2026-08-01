/**
 * /customer/invitations/[invitationId] — 顧客の招待受諾画面。
 * 招待内容は表示しない（案件内容は受諾＝participant になるまで不可視）。
 * 受諾は Server Action。DB 側で本人メール一致・期限・状態を再検証する。
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require";
import { isUuid } from "@/lib/auth/validators";
import { acceptCaseInvitation } from "./actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ invitationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function InvitationPage({ params, searchParams }: PageProps) {
  const { invitationId } = await params;
  if (!isUuid(invitationId)) notFound();
  await requireAuthenticatedUser();

  const sp = await searchParams;
  const hasError = sp.e === "1";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-lg font-semibold">案件への招待</h1>
      <p className="text-sm text-slate-600">
        不動産会社から住宅ローン案件への参加を招待されています。参加する場合は「招待を受諾」を押してください。
      </p>

      {hasError ? (
        <div
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          招待を受諾できませんでした。招待の期限が切れているか、状態が変更された可能性があります。
          お手数ですが、招待した担当者へお問い合わせください。
        </div>
      ) : null}

      <form action={acceptCaseInvitation}>
        <input type="hidden" name="invitationId" value={invitationId} />
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          招待を受諾
        </button>
      </form>

      <Link href="/customer/cases" className="text-sm text-slate-600 hover:underline">
        マイページへ戻る
      </Link>
    </div>
  );
}
