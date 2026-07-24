/**
 * ルート: ログイン後の遷移先をサーバー側で判定して振り分ける。
 * DB / Auth 障害は /error（no-access と混同しない）。
 */

import { redirect } from "next/navigation";
import { getCurrentAccess, type CurrentAccess } from "@/lib/auth/membership";
import { decideLanding, routeForDecision } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  let access: CurrentAccess | null = null;
  let failed = false;
  try {
    access = await getCurrentAccess();
  } catch {
    failed = true;
  }
  if (failed || access === null) redirect("/error");
  if (!access.authenticated) redirect("/login");
  redirect(routeForDecision(decideLanding(access.ctx)));
}
