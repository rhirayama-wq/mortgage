/**
 * 案件詳細: 申込者・招待・進捗セクション。
 * スタッフは各申込者の招待状態・受諾有無・基本情報の入力開始状況を確認できる（進捗確認）。
 * 申込者の招待フォームを含む（Server Action inviteApplicant）。
 */

import type { StaffCaseDetail } from "@/lib/customer-cases/queries";
import {
  caseApplicantTypeLabel,
  caseInvitationStatusLabel,
  formatDate,
} from "@/lib/customer-cases/labels";
import { inviteApplicant } from "../actions";

const NOTICE: Record<string, { kind: "ok" | "error"; text: string }> = {
  "invited=1": { kind: "ok", text: "招待を作成しました。" },
  "e=email": { kind: "error", text: "メールアドレスの形式が正しくありません。" },
  "e=type": { kind: "error", text: "申込者区分が不正です。" },
  "e=invite": {
    kind: "error",
    text: "招待を作成できませんでした。案件の状態や既存の招待をご確認ください。",
  },
};

export function ApplicantsSection({
  detail,
  noticeKey,
}: {
  detail: StaffCaseDetail;
  noticeKey: string;
}) {
  const notice = NOTICE[noticeKey];
  const canInvite = detail.status !== "cancelled" && detail.status !== "expired";
  const hasPrimary = detail.applicants.some((a) => a.applicantType === "primary");

  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold">申込者と進捗</h2>

      {notice ? (
        <div
          className={
            notice.kind === "ok"
              ? "mb-3 rounded border border-green-300 bg-green-50 p-2 text-xs text-green-800"
              : "mb-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800"
          }
          role={notice.kind === "error" ? "alert" : undefined}
        >
          {notice.text}
        </div>
      ) : null}

      {detail.applicants.length === 0 ? (
        <p className="mb-4 text-sm text-slate-600">
          まだ申込者がいません。下のフォームから主申込者を招待してください。
        </p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {detail.applicants.map((a) => (
            <li
              key={a.applicantId}
              className="rounded border border-slate-100 bg-slate-50 p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {caseApplicantTypeLabel(a.applicantType)}
                </span>
                <span className="text-xs text-slate-500">
                  {a.invitationStatus
                    ? `招待: ${caseInvitationStatusLabel(a.invitationStatus)}`
                    : "招待なし"}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                <span>氏名: {a.fullName ?? "未入力"}</span>
                <span>{a.accepted ? "受諾済み" : "未受諾"}</span>
                <span>
                  基本情報: {a.basicInfoStarted ? "入力あり" : "未入力"}
                </span>
                {a.invitationStatus === "invited" && a.invitationExpiresAt ? (
                  <span>招待期限: {formatDate(a.invitationExpiresAt)}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canInvite ? (
        <form
          action={inviteApplicant}
          className="flex flex-col gap-3 border-t border-slate-100 pt-3"
        >
          <input type="hidden" name="caseId" value={detail.id} />
          <div className="text-xs font-semibold text-slate-700">申込者を招待</div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-slate-500">申込者区分</span>
            <select
              name="applicantType"
              defaultValue={hasPrimary ? "co_applicant" : "primary"}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="primary" disabled={hasPrimary}>
                主申込者{hasPrimary ? "（登録済み）" : ""}
              </option>
              <option value="co_applicant">共同申込者</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-slate-500">招待するメールアドレス</span>
            <input
              type="email"
              name="invitedEmail"
              required
              placeholder="customer@example.test"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-slate-500">
              続柄（共同申込者の場合・任意）
            </span>
            <input
              type="text"
              name="relationship"
              maxLength={100}
              placeholder="例: 配偶者"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>

          <div>
            <button
              type="submit"
              className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              招待を作成
            </button>
          </div>
        </form>
      ) : (
        <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
          この案件は招待を受け付けていません（{detail.status}）。
        </p>
      )}
    </section>
  );
}
