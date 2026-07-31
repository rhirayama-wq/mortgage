"use client";

/** 基本情報の確認（§9.9）。自動入力済みの架空情報を確認・修正できる。 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerShell } from "@/components/loan-checker-moc/customer-shell";
import { Card, Field, Note, inputClass } from "@/components/loan-checker-moc/ui";
import { useDemo } from "@/lib/loan-checker-moc/store";

export default function ProfilePage() {
  const { customerCase, updateCase, markStep } = useDemo();
  const router = useRouter();
  const a = customerCase?.applicant;

  const [fullName, setFullName] = useState(a?.fullName ?? "");
  const [kana, setKana] = useState(a?.fullNameKana ?? "");
  const [birthDate, setBirthDate] = useState(a?.birthDate ?? "");
  const [address, setAddress] = useState(a?.address ?? "");

  if (!customerCase) {
    return (
      <CustomerShell stepKey="profile" title="基本情報">
        <Note tone="neutral">
          対象の案件が見つかりません。営業側の招待から顧客デモを開いてください。
        </Note>
      </CustomerShell>
    );
  }

  function next() {
    const id = customerCase!.id;
    updateCase(id, (c) => ({
      ...c,
      applicant: {
        ...c.applicant,
        fullName,
        fullNameKana: kana,
        birthDate,
        address,
      },
    }));
    markStep(id, "profileDone");
    router.push("/loan-checker/customer/employment");
  }

  return (
    <CustomerShell
      stepKey="profile"
      title="基本情報の確認"
      subtitle="本人確認の結果から自動入力しています（架空データ）。必要なら修正できます。"
      footer={
        <button
          type="button"
          onClick={next}
          className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white"
        >
          次へ（勤務・収入）
        </button>
      }
    >
      <Card>
        <div className="space-y-3">
          <Field label="氏名" htmlFor="fn">
            <input id="fn" className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="氏名（カナ）" htmlFor="kn">
            <input id="kn" className={inputClass} value={kana} onChange={(e) => setKana(e.target.value)} />
          </Field>
          <Field label="生年月日" htmlFor="bd">
            <input id="bd" className={inputClass} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </Field>
          <Field label="住所" htmlFor="ad">
            <input id="ad" className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
        </div>
      </Card>
      <Note tone="neutral">
        自動入力された内容は架空です。マイナンバーや書類画像は保存していません。
      </Note>
    </CustomerShell>
  );
}
