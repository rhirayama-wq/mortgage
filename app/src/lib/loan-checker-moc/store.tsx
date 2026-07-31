"use client";

/**
 * Loan Checker MoC 状態ストア（クライアント専用）。
 * 架空のデモ状態のみ localStorage に保存する。
 * token / Cookie / JWT / 実個人情報 / 信用情報 / 本人確認データは一切保存しない。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type {
  DemoCase,
  DemoCustomerFlow,
  DemoRole,
  IdentityMethod,
  IdentityStatus,
  InvitePayload,
} from "./types";
import {
  SEED_CASES,
  SEED_YAMADA_ID,
  YAMADA_ASSESSMENT,
  createCaseFromInvite,
} from "./fixtures";

const STORAGE_KEY = "loan-checker-moc-v1";

interface PersistedState {
  role: DemoRole;
  cases: DemoCase[];
  customerCaseId: string;
}

interface DemoState extends PersistedState {
  hydrated: boolean;
}

function initialState(): DemoState {
  return {
    role: "agent",
    cases: SEED_CASES,
    customerCaseId: SEED_YAMADA_ID,
    hydrated: false,
  };
}

type Action =
  | { type: "HYDRATE"; persisted: PersistedState }
  | { type: "MARK_HYDRATED" }
  | { type: "SET_ROLE"; role: DemoRole }
  | { type: "SET_CUSTOMER_CASE"; id: string }
  | { type: "ADD_CASE"; demoCase: DemoCase }
  | { type: "UPDATE_CASE"; id: string; updater: (c: DemoCase) => DemoCase }
  | { type: "RESET" };

function reducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case "HYDRATE":
      return { ...action.persisted, hydrated: true };
    case "MARK_HYDRATED":
      return { ...state, hydrated: true };
    case "SET_ROLE":
      return { ...state, role: action.role };
    case "SET_CUSTOMER_CASE":
      return { ...state, customerCaseId: action.id };
    case "ADD_CASE":
      return { ...state, cases: [action.demoCase, ...state.cases] };
    case "UPDATE_CASE":
      return {
        ...state,
        cases: state.cases.map((c) =>
          c.id === action.id ? action.updater(c) : c,
        ),
      };
    case "RESET":
      return { ...initialState(), hydrated: true };
    default:
      return state;
  }
}

interface DemoContextValue {
  hydrated: boolean;
  role: DemoRole;
  cases: DemoCase[];
  customerCaseId: string;
  customerCase: DemoCase | undefined;
  setRole: (role: DemoRole) => void;
  getCase: (id: string) => DemoCase | undefined;
  setCustomerCase: (id: string) => void;
  invite: (payload: InvitePayload) => string;
  updateCase: (id: string, updater: (c: DemoCase) => DemoCase) => void;
  markStep: (id: string, step: keyof DemoCustomerFlow) => void;
  setIdentity: (
    id: string,
    method: IdentityMethod,
    status: IdentityStatus,
  ) => void;
  setConsentGranted: (id: string, key: string, granted: boolean) => void;
  grantAllConsent: (id: string) => void;
  completeAssessment: (id: string) => void;
  submitConsultation: (
    id: string,
    payload: { preferredDate: string; method: string; topic: string },
  ) => void;
  reset: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

function nowLabel(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  // マウント時に localStorage の架空デモ状態を復元する。
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        if (parsed && Array.isArray(parsed.cases) && parsed.cases.length > 0) {
          dispatch({ type: "HYDRATE", persisted: parsed });
          return;
        }
      }
    } catch {
      // 壊れた保存値は無視してシード状態で継続する。
    }
    dispatch({ type: "MARK_HYDRATED" });
  }, []);

  // 変更のたびに架空デモ状態を保存する（hydrate 後のみ）。
  useEffect(() => {
    if (!state.hydrated) return;
    try {
      const persisted: PersistedState = {
        role: state.role,
        cases: state.cases,
        customerCaseId: state.customerCaseId,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // 保存に失敗してもデモ継続を優先する。
    }
  }, [state]);

  const setRole = useCallback((role: DemoRole) => {
    dispatch({ type: "SET_ROLE", role });
  }, []);

  const getCase = useCallback(
    (id: string) => stateRef.current.cases.find((c) => c.id === id),
    [],
  );

  const setCustomerCase = useCallback((id: string) => {
    dispatch({ type: "SET_CUSTOMER_CASE", id });
  }, []);

  const updateCase = useCallback(
    (id: string, updater: (c: DemoCase) => DemoCase) => {
      dispatch({ type: "UPDATE_CASE", id, updater });
    },
    [],
  );

  const invite = useCallback((payload: InvitePayload): string => {
    const id = `moc-${Date.now().toString(36)}`;
    const demoCase = createCaseFromInvite({
      id,
      customerName: payload.customerName,
      email: payload.email,
      caseName: payload.caseName,
      desiredPriceYen: payload.desiredPriceYen,
      desiredPropertyName: payload.desiredPropertyName,
      message: payload.message,
      lastUpdated: nowLabel(),
    });
    dispatch({ type: "ADD_CASE", demoCase });
    return id;
  }, []);

  const markStep = useCallback(
    (id: string, step: keyof DemoCustomerFlow) => {
      updateCase(id, (c) => ({
        ...c,
        flow: { ...c.flow, [step]: true },
        status: c.status === "invited" || c.status === "opened" ? "inputting" : c.status,
        lastUpdated: nowLabel(),
      }));
    },
    [updateCase],
  );

  const setIdentity = useCallback(
    (id: string, method: IdentityMethod, status: IdentityStatus) => {
      updateCase(id, (c) => ({
        ...c,
        identity: { method, status },
        status: status === "verified" ? "inputting" : "identity",
        flow: { ...c.flow, identityDone: status === "verified" },
        lastUpdated: nowLabel(),
      }));
    },
    [updateCase],
  );

  const setConsentGranted = useCallback(
    (id: string, key: string, granted: boolean) => {
      updateCase(id, (c) => ({
        ...c,
        consent: {
          ...c.consent,
          items: c.consent.items.map((it) =>
            it.key === key ? { ...it, granted } : it,
          ),
        },
      }));
    },
    [updateCase],
  );

  const grantAllConsent = useCallback(
    (id: string) => {
      updateCase(id, (c) => ({
        ...c,
        consent: {
          ...c.consent,
          items: c.consent.items.map((it) => ({ ...it, granted: true })),
        },
        flow: { ...c.flow, consentDone: true },
        status: "assessing",
        lastUpdated: nowLabel(),
      }));
    },
    [updateCase],
  );

  const completeAssessment = useCallback(
    (id: string) => {
      updateCase(id, (c) => ({
        ...c,
        assessment: c.assessment ?? YAMADA_ASSESSMENT,
        flow: { ...c.flow, processingDone: true },
        status: "assessed",
        nextAction: "診断結果を確認し、モゲチェック相談へ引き継ぐ",
        lastUpdated: nowLabel(),
      }));
    },
    [updateCase],
  );

  const submitConsultation = useCallback(
    (
      id: string,
      payload: { preferredDate: string; method: string; topic: string },
    ) => {
      const summary = [payload.preferredDate, payload.method, payload.topic]
        .filter((v) => v.length > 0)
        .join(" / ");
      updateCase(id, (c) => ({
        ...c,
        status: "consulted",
        nextAction: "モゲチェック相談の日程調整中",
        timeline: [
          ...c.timeline,
          {
            at: nowLabel(),
            label: `モゲチェック相談を申込（${summary}）`,
            actor: "顧客",
          },
        ],
        lastUpdated: nowLabel(),
      }));
    },
    [updateCase],
  );

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  const value = useMemo<DemoContextValue>(
    () => ({
      hydrated: state.hydrated,
      role: state.role,
      cases: state.cases,
      customerCaseId: state.customerCaseId,
      customerCase: state.cases.find((c) => c.id === state.customerCaseId),
      setRole,
      getCase,
      setCustomerCase,
      invite,
      updateCase,
      markStep,
      setIdentity,
      setConsentGranted,
      grantAllConsent,
      completeAssessment,
      submitConsultation,
      reset,
    }),
    [
      state,
      setRole,
      getCase,
      setCustomerCase,
      invite,
      updateCase,
      markStep,
      setIdentity,
      setConsentGranted,
      grantAllConsent,
      completeAssessment,
      submitConsultation,
      reset,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) {
    throw new Error("useDemo は DemoProvider の内側で使用してください");
  }
  return ctx;
}
