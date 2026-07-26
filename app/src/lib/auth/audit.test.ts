/**
 * B13-HTTP: 失敗監査書込みの結果分類とログ分離の単体テスト。
 * FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
 *
 * 目的は「設計どおりの拒否（SEC-83/84 偽造防止ガード）」と
 * 「監査経路そのものの障害」をログ上で取り違えないこと。
 * 判定不能なものは必ず障害側（= 大きく鳴らす方）へ倒す（fail-open にしない）。
 *
 * Supabase には接続しない（service クライアントを差し替える）。
 * テスト出力へ秘密情報（key / token / メール）を出さないため、ダミー値も
 * 秘密に見える文字列を使わず、アサーションは「含まれていないこと」を検査する。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("../supabase/service", () => ({
  createSupabaseServiceClient: () => ({ rpc }),
}));

import {
  MEMBERSHIP_ACCEPT_ERROR_CODES,
  isActorMembershipMismatchError,
  recordMembershipAcceptFailure,
  toSafeErrorCode,
  type MembershipAcceptFailureInput,
} from "./audit";

const CORRELATION_ID = "3f6b1c2a-0d4e-4a5b-8c9d-1e2f3a4b5c6d";

/** DB 生エラーに紛れ込みがちな秘密様文字列（ログへ出ていないことの検査に使う）。 */
const SECRET_MARKER = "eyJhbGciOiJIUzI1NiJ9.SERVICE-ROLE-KEY-SHAPED-VALUE";

const INPUT: MembershipAcceptFailureInput = {
  actorUserId: "00000000-0000-4000-8000-000000000001",
  membershipId: "00000000-0000-4000-8000-0000000000f0",
  errorCode: "membership_not_found",
  correlationId: CORRELATION_ID,
};

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

/** console 出力はテスト出力へ流さず、内容だけを検査する（秘密の二次漏洩を防ぐ）。 */
beforeEach(() => {
  rpc.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  warnSpy.mockRestore();
});

function loggedText(): string {
  return [...errorSpy.mock.calls, ...warnSpy.mock.calls]
    .map((args) => args.map((a) => String(a)).join(" "))
    .join("\n");
}

describe("recordMembershipAcceptFailure", () => {
  it("① RPC が成功したら recorded を返し、障害ログを出さない", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await expect(recordMembershipAcceptFailure(INPUT)).resolves.toBe("recorded");

    expect(rpc).toHaveBeenCalledWith("app_record_membership_accept_failure", {
      p_actor_user_id: INPUT.actorUserId,
      p_membership_id: INPUT.membershipId,
      p_error_code: INPUT.errorCode,
      p_correlation_id: INPUT.correlationId,
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("② SEC-83 ガード拒否は refused_by_guard で、write failed ログにはしない", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "22023", message: "audit_actor_membership_mismatch" },
    });

    await expect(recordMembershipAcceptFailure(INPUT)).resolves.toBe(
      "refused_by_guard",
    );

    // 監査障害としては鳴らさない（本物の障害を覆い隠さないための分離）
    expect(errorSpy).not.toHaveBeenCalled();
    // ただしログを完全に消さない（セキュリティ事象として warn は残す）
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = loggedText();
    expect(logged).toContain("refused by actor/membership guard");
    expect(logged).not.toContain("write failed");
    expect(logged).toContain(CORRELATION_ID);
  });

  it("③ ガード以外の RPC エラーは write_failed として強く鳴らす", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied for function" },
    });

    await expect(recordMembershipAcceptFailure(INPUT)).resolves.toBe(
      "write_failed",
    );

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(loggedText()).toContain("[audit] failure-audit write failed");
  });

  it("④ RPC 呼び出し自体が例外を投げても throw せず write_failed を返す", async () => {
    rpc.mockRejectedValue(new Error("fetch failed"));

    await expect(recordMembershipAcceptFailure(INPUT)).resolves.toBe(
      "write_failed",
    );

    expect(warnSpy).not.toHaveBeenCalled();
    expect(loggedText()).toContain("[audit] failure-audit unexpected error");
  });

  it("⑤ error の形が不明なときは安全側（write_failed）へ倒す", async () => {
    for (const unknownShape of [
      { data: null, error: {} },
      { data: null, error: { message: 123 } },
      { data: null, error: "audit_actor_membership_mismatch" },
      { data: null, error: true },
    ]) {
      rpc.mockReset();
      errorSpy.mockClear();
      warnSpy.mockClear();
      rpc.mockResolvedValue(unknownShape);

      await expect(recordMembershipAcceptFailure(INPUT)).resolves.toBe(
        "write_failed",
      );
      expect(warnSpy).not.toHaveBeenCalled();
    }
  });

  it("⑥ ログへ DB 生エラー全文・秘密様文字列・actor / membership ID を出さない", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "XX000",
        message: `connection string leaked ${SECRET_MARKER} for user ${INPUT.actorUserId}`,
        details: SECRET_MARKER,
        hint: SECRET_MARKER,
      },
    });

    await expect(recordMembershipAcceptFailure(INPUT)).resolves.toBe(
      "write_failed",
    );

    const logged = loggedText();
    expect(logged).not.toContain(SECRET_MARKER);
    expect(logged).not.toContain("connection string leaked");
    expect(logged).not.toContain(INPUT.actorUserId);
    expect(logged).not.toContain(INPUT.membershipId);
    // 出るのは固定メッセージと correlation ID のみ
    expect(logged).toContain(CORRELATION_ID);
  });

  it("⑦ ガード拒否ログにも actor / membership ID を出さない", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "22023",
        message: `audit_actor_membership_mismatch ${SECRET_MARKER}`,
      },
    });

    await expect(recordMembershipAcceptFailure(INPUT)).resolves.toBe(
      "refused_by_guard",
    );

    const logged = loggedText();
    expect(logged).not.toContain(SECRET_MARKER);
    expect(logged).not.toContain(INPUT.actorUserId);
    expect(logged).not.toContain(INPUT.membershipId);
  });
});

describe("isActorMembershipMismatchError", () => {
  it("SEC-83 ガードの例外を拒否として識別する", () => {
    expect(
      isActorMembershipMismatchError({
        code: "22023",
        message: "audit_actor_membership_mismatch",
      }),
    ).toBe(true);
  });

  it("PostgREST が前後に文言を付けても識別できる", () => {
    expect(
      isActorMembershipMismatchError({
        message:
          "PL/pgSQL function app_record_membership_accept_failure: audit_actor_membership_mismatch (SQLSTATE 22023)",
      }),
    ).toBe(true);
  });

  it("他の監査ガードは拒否扱いにしない（障害側へ倒す）", () => {
    for (const guard of [
      "audit_actor_required",
      "audit_membership_id_required",
      "audit_correlation_required",
      "audit_error_code_not_allowed",
    ]) {
      expect(isActorMembershipMismatchError({ message: guard })).toBe(false);
    }
  });

  it("接続断・権限エラー・null・文字列は拒否扱いにしない", () => {
    expect(isActorMembershipMismatchError({ message: "fetch failed" })).toBe(
      false,
    );
    expect(
      isActorMembershipMismatchError({
        message: "permission denied for function",
      }),
    ).toBe(false);
    expect(isActorMembershipMismatchError(null)).toBe(false);
    expect(isActorMembershipMismatchError(undefined)).toBe(false);
    expect(
      isActorMembershipMismatchError("audit_actor_membership_mismatch"),
    ).toBe(false);
    expect(isActorMembershipMismatchError({})).toBe(false);
  });
});

describe("toSafeErrorCode", () => {
  it("業務 RPC の例外名を許可リスト内の error_code へ正規化する", () => {
    expect(toSafeErrorCode({ message: "not_authorized" })).toBe(
      "not_authorized",
    );
    expect(toSafeErrorCode({ message: "membership_not_found" })).toBe(
      "membership_not_found",
    );
    expect(toSafeErrorCode({ message: "invite_email_mismatch" })).toBe(
      "invite_email_mismatch",
    );
  });

  it("未知のエラーは unexpected_error へ落とす（内部詳細を漏らさない）", () => {
    expect(toSafeErrorCode({ message: "connection reset by peer" })).toBe(
      "unexpected_error",
    );
    expect(toSafeErrorCode(null)).toBe("unexpected_error");
  });

  it("正規化結果は必ず DB 許可リストに含まれる", () => {
    const allowed = new Set<string>(MEMBERSHIP_ACCEPT_ERROR_CODES);
    for (const sample of [
      { message: "not_authorized" },
      { message: "membership_left_terminal" },
      { message: "未知のエラー" },
      {},
      null,
    ]) {
      expect(allowed.has(toSafeErrorCode(sample))).toBe(true);
    }
  });
});
