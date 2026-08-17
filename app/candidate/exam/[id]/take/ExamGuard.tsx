"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { getViolationAction, type ExamPolicy, type ViolationKind } from "@/lib/exam-policy";
import { heartbeatExam, recordViolation, submitExam } from "./actions";

type Props = {
  examId: string;
  policy: ExamPolicy;
};

function shortcutLabel(event: KeyboardEvent) {
  return [event.ctrlKey ? "Ctrl" : "", event.metaKey ? "Meta" : "", event.altKey ? "Alt" : "", event.shiftKey ? "Shift" : "", event.key]
    .filter(Boolean)
    .join("+");
}

export default function ExamGuard({ examId, policy }: Props) {
  const router = useRouter();
  const [violationCount, setViolationCount] = useState(0);
  const [warning, setWarning] = useState("");
  const [screenShield, setScreenShield] = useState(false);
  const [fullscreenGate, setFullscreenGate] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(true);
  const [submittingByPolicy, setSubmittingByPolicy] = useState(false);
  const [deviceConflict, setDeviceConflict] = useState(false);

  const tabIdRef = useRef("");
  const deviceIdRef = useRef("");
  const eventCounterRef = useRef(0);
  const violationCountRef = useRef(0);
  const lastEventAtRef = useRef<Record<string, number>>({});
  const hasEnteredFullscreenRef = useRef(false);
  const submittedRef = useRef(false);
  const pendingOfflineAtRef = useRef<string | null>(null);

  const getTabId = useCallback(() => {
    if (!tabIdRef.current) {
      tabIdRef.current = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return tabIdRef.current;
  }, []);

  const getDeviceId = useCallback(() => {
    if (deviceIdRef.current) return deviceIdRef.current;
    const storageKey = "exam-platform-device-id-v1";
    const existing = window.localStorage.getItem(storageKey);
    if (existing) {
      deviceIdRef.current = existing;
      return existing;
    }
    const created = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(storageKey, created);
    deviceIdRef.current = created;
    return created;
  }, []);

  const autoSubmitFallback = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmittingByPolicy(true);
    try {
      await submitExam(examId);
      router.replace(`/candidate/exam/${examId}/result`);
      router.refresh();
    } catch (error) {
      console.error("POLICY AUTO SUBMIT FALLBACK ERROR:", error);
      submittedRef.current = false;
      setSubmittingByPolicy(false);
      setWarning("Batas pelanggaran tercapai, tetapi submit otomatis gagal. Segera hubungi pengawas.");
    }
  }, [examId, router]);

  const report = useCallback(async (
    kind: ViolationKind,
    detail: Record<string, string | number | boolean | null> = {},
    cooldownKey: string = kind,
    cooldownMs = 1200,
    clientEventAt?: string
  ) => {
    if (!policy.security.enableProctoring || submittedRef.current) return;

    const now = Date.now();
    const last = lastEventAtRef.current[cooldownKey] ?? 0;
    if (now - last < cooldownMs) return;
    lastEventAtRef.current[cooldownKey] = now;

    eventCounterRef.current += 1;
    const eventAction = getViolationAction(policy, kind);
    const clientCount = eventAction === "LOG"
      ? violationCountRef.current
      : violationCountRef.current + 1;
    violationCountRef.current = clientCount;
    setViolationCount(clientCount);

    if (policy.security.warnBeforeAutoSubmit) {
      const remaining = Math.max(0, policy.security.violationLimit - clientCount);
      setWarning(
        eventAction === "SUBMIT"
          ? "Jenis pelanggaran ini diatur pengawas sebagai AUTO SUBMIT. Sesi sedang difinalisasi."
          : eventAction === "LOG"
            ? "Aktivitas terdeteksi dan dicatat pada audit pengawas."
            : policy.security.autoSubmitOnLimit
          ? `Pelanggaran terdeteksi. ${remaining} toleransi tersisa sebelum sesi di-submit otomatis.`
          : `Pelanggaran terdeteksi dan dicatat untuk pengawas. Total lokal: ${clientCount}.`
      );
    }

    try {
      const result = await recordViolation(
        examId,
        kind,
        detail,
        `${examId}:${getTabId()}:${eventCounterRef.current}:${kind}`,
        clientEventAt ?? new Date(now).toISOString()
      );

      const authoritativeCount = result.logged ? result.count : clientCount;
      if (authoritativeCount > 0) {
        violationCountRef.current = authoritativeCount;
        setViolationCount(authoritativeCount);
      }

      if (result.autoSubmitted) {
        submittedRef.current = true;
        setSubmittingByPolicy(true);
        router.replace(`/candidate/exam/${examId}/result`);
        router.refresh();
        return;
      }

      if (
        eventAction === "SUBMIT" ||
        (
          policy.security.autoSubmitOnLimit &&
          authoritativeCount >= policy.security.violationLimit
        )
      ) {
        await autoSubmitFallback();
      }
    } catch (error) {
      console.error("REPORT VIOLATION ERROR:", error);
      if (
        eventAction === "SUBMIT" ||
        (
          policy.security.autoSubmitOnLimit &&
          clientCount >= policy.security.violationLimit
        )
      ) {
        await autoSubmitFallback();
      }
    }
  }, [autoSubmitFallback, examId, getTabId, policy.security, router]);

  useEffect(() => {
    if (!policy.security.enableProctoring) return;

    const beat = async () => {
      try {
        const result = await heartbeatExam(examId, getDeviceId(), navigator.userAgent);
        if (result && "conflict" in result && result.conflict) {
          setDeviceConflict(true);
          void report("MULTIPLE_DEVICE", { conflict: true }, "multiple-device", 30000);
        } else {
          setDeviceConflict(false);
        }
      } catch (error) {
        console.error("EXAM HEARTBEAT ERROR:", error);
      }
    };

    void beat();
    const timer = window.setInterval(() => {
      void beat();
    }, 25000);

    return () => window.clearInterval(timer);
  }, [examId, getDeviceId, policy.security.enableProctoring, report]);

  useEffect(() => {
    if (!policy.security.enableProctoring) return;

    const onVisibility = () => {
      if (document.visibilityState === "hidden" && policy.security.detectTabSwitch) {
        void report("TAB_HIDDEN", { visibilityState: document.visibilityState }, "focus-loss", 1800);
      }
    };
    const onBlur = () => {
      if (policy.security.detectWindowBlur) {
        void report("WINDOW_BLUR", { reason: "window_blur" }, "focus-loss", 1800);
      }
    };
    const onOffline = () => {
      if (!policy.security.detectOffline) return;
      pendingOfflineAtRef.current = new Date().toISOString();
      setWarning("Koneksi internet terputus. Lanjutkan hanya setelah koneksi kembali agar autosave dan audit dapat tersinkron.");
    };
    const onOnline = () => {
      if (!policy.security.detectOffline || !pendingOfflineAtRef.current) return;
      const offlineAt = pendingOfflineAtRef.current;
      pendingOfflineAtRef.current = null;
      void report(
        "OFFLINE",
        { online: true, reconnected: true, offlineAt },
        "offline-recovered",
        0,
        offlineAt
      );
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [policy.security, report]);

  useEffect(() => {
    if (!policy.security.enableProctoring) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
      eventCounterRef.current += 1;
      const payload = JSON.stringify({
        key: `${examId}:${getTabId()}:${eventCounterRef.current}:PAGE_LEAVE`,
        clientEventAt: new Date().toISOString(),
      });
      try {
        navigator.sendBeacon(
          `/candidate/exam/${examId}/take/proctor-event`,
          new Blob([payload], { type: "application/json" })
        );
      } catch (error) {
        console.error("PAGE LEAVE BEACON ERROR:", error);
      }

      if (policy.session.warnOnPageLeave) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [examId, getTabId, policy.security.enableProctoring, policy.session.warnOnPageLeave]);

  useEffect(() => {
    if (!policy.security.enableProctoring) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const ctrlOrMeta = event.ctrlKey || event.metaKey;

      if (event.key === "PrintScreen" && policy.security.detectPrintScreen) {
        event.preventDefault();
        setScreenShield(true);
        window.setTimeout(() => setScreenShield(false), 1400);
        void report("PRINT_SCREEN", { key: "PrintScreen" }, "print-screen", 1500);
        return;
      }

      const copyPaste = ctrlOrMeta && ["c", "x", "v"].includes(key) && policy.security.preventCopyPaste;
      const print = ctrlOrMeta && key === "p" && policy.security.preventPrint;
      const save = ctrlOrMeta && key === "s" && policy.security.preventSavePage;
      const devtools = policy.security.preventDevtoolsShortcuts && (
        event.key === "F12" ||
        (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key)) ||
        (event.metaKey && event.altKey && ["i", "j", "c"].includes(key)) ||
        (event.ctrlKey && key === "u")
      );

      if (copyPaste || print || save || devtools) {
        event.preventDefault();
        const kind: ViolationKind = copyPaste ? "COPY_PASTE" : "BLOCKED_SHORTCUT";
        void report(kind, { shortcut: shortcutLabel(event) }, copyPaste ? "clipboard" : `shortcut-${key}`, 1000);
      }
    };

    const onClipboard = (event: ClipboardEvent) => {
      if (!policy.security.preventCopyPaste) return;
      event.preventDefault();
      void report("COPY_PASTE", { operation: event.type }, "clipboard", 1000);
    };

    const onContextMenu = (event: MouseEvent) => {
      if (!policy.security.preventContextMenu) return;
      event.preventDefault();
      void report("CONTEXT_MENU", { x: Math.round(event.clientX), y: Math.round(event.clientY) }, "context-menu", 1200);
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("copy", onClipboard, true);
    document.addEventListener("cut", onClipboard, true);
    document.addEventListener("paste", onClipboard, true);
    document.addEventListener("contextmenu", onContextMenu, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("copy", onClipboard, true);
      document.removeEventListener("cut", onClipboard, true);
      document.removeEventListener("paste", onClipboard, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
    };
  }, [policy.security, report]);

  useEffect(() => {
    if (!policy.security.enableProctoring || !policy.security.detectDuplicateTab) return;
    if (!("BroadcastChannel" in window)) return;

    const channel = new BroadcastChannel(`exam-proctor-${examId}`);
    const tabId = getTabId();
    let duplicateReported = false;

    channel.onmessage = (event: MessageEvent<{ type?: string; tabId?: string }>) => {
      if (!event.data?.tabId || event.data.tabId === tabId) return;
      if (event.data.type === "HELLO") {
        channel.postMessage({ type: "PRESENT", tabId });
      }
      if ((event.data.type === "HELLO" || event.data.type === "PRESENT") && !duplicateReported) {
        duplicateReported = true;
        void report("DUPLICATE_TAB", { otherTabDetected: true }, "duplicate-tab", 10000);
      }
    };

    channel.postMessage({ type: "HELLO", tabId });
    return () => channel.close();
  }, [examId, getTabId, policy.security.detectDuplicateTab, policy.security.enableProctoring, report]);

  useEffect(() => {
    if (!policy.security.enableProctoring || !policy.security.requireFullscreen) return;

    const element = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
    const supported = typeof element.requestFullscreen === "function";
    setFullscreenSupported(supported);
    setFullscreenGate(supported && !document.fullscreenElement);

    if (!supported) return;

    const onFullscreenChange = () => {
      if (document.fullscreenElement) {
        hasEnteredFullscreenRef.current = true;
        setFullscreenGate(false);
        return;
      }

      if (hasEnteredFullscreenRef.current) {
        setFullscreenGate(true);
        void report("FULLSCREEN_EXIT", { fullscreen: false }, "fullscreen-exit", 1500);
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [policy.security.enableProctoring, policy.security.requireFullscreen, report]);

  useEffect(() => {
    const body = document.body;
    if (policy.security.enableProctoring && policy.security.preventTextSelection) body.classList.add("exam-no-select");
    if (policy.security.enableProctoring && policy.security.preventPrint) body.classList.add("exam-no-print");
    return () => {
      body.classList.remove("exam-no-select");
      body.classList.remove("exam-no-print");
    };
  }, [policy.security.enableProctoring, policy.security.preventPrint, policy.security.preventTextSelection]);

  async function enterFullscreen() {
    const element = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
    if (!element.requestFullscreen) {
      setFullscreenSupported(false);
      setFullscreenGate(false);
      return;
    }
    try {
      await element.requestFullscreen();
      hasEnteredFullscreenRef.current = true;
      setFullscreenGate(false);
    } catch (error) {
      console.error("FULLSCREEN REQUEST ERROR:", error);
      setWarning("Browser menolak fullscreen. Izinkan fullscreen lalu coba lagi, atau hubungi pengawas.");
    }
  }

  if (!policy.security.enableProctoring) return null;

  return (
    <>
      <style>{`
        .exam-no-select main { user-select: none !important; -webkit-user-select: none !important; }
        @media print { .exam-no-print * { visibility: hidden !important; display: none !important; } }
      `}</style>

      {warning ? (
        <div className="fixed left-1/2 top-[112px] z-[90] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-[16px] border border-amber-400/20 candidate-floating-surface px-4 py-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-amber-200">Peringatan Pengawasan · {violationCount}/{policy.security.violationLimit}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-400">{warning}</p>
            </div>
            <button type="button" onClick={() => setWarning("")} className="text-xs text-slate-600 hover:text-slate-300">×</button>
          </div>
        </div>
      ) : null}

      {screenShield ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center candidate-overlay-solid px-6 text-center">
          <div><p className="text-lg font-semibold text-white">Screenshot terdeteksi</p><p className="mt-2 text-sm text-slate-500">Event telah dicatat untuk pengawas.</p></div>
        </div>
      ) : null}

      {fullscreenGate ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center candidate-overlay-backdrop px-6 backdrop-blur-xl">
          <div className="liquid-card w-full max-w-md p-7 text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-300/70">Focus Mode</p>
            <h2 className="mt-3 text-xl font-semibold text-white">Fullscreen wajib</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Ujian ini mewajibkan fullscreen. Keluar dari fullscreen setelah sesi berjalan akan dicatat sebagai pelanggaran.</p>
            <button type="button" onClick={enterFullscreen} className="liquid-button-primary mt-5 w-full rounded-[14px] px-5 py-3 text-sm font-semibold">Masuk Fullscreen</button>
          </div>
        </div>
      ) : null}

      {!fullscreenSupported && policy.security.requireFullscreen ? (
        <div className="fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-amber-400/15 candidate-floating-surface px-4 py-2 text-[10px] text-amber-200">Fullscreen API tidak didukung perangkat ini; monitoring lain tetap aktif.</div>
      ) : null}

      {submittingByPolicy ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center candidate-overlay-backdrop px-6 backdrop-blur-xl">
          <div className="liquid-card max-w-sm p-7 text-center"><p className="font-semibold text-rose-200">Sesi di-submit otomatis</p><p className="mt-2 text-sm leading-6 text-slate-500">Batas pelanggaran yang ditetapkan pengawas telah tercapai.</p></div>
        </div>
      ) : null}

      {deviceConflict ? (
        <div className="fixed inset-0 z-[125] flex items-center justify-center candidate-overlay-backdrop px-6 backdrop-blur-xl">
          <div className="liquid-card w-full max-w-md p-7 text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-rose-300/70">Single Device Lock</p>
            <h2 className="mt-3 text-xl font-semibold text-white">Sesi aktif di perangkat lain</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Credential ini sedang memiliki device lock aktif. Tutup sesi di perangkat lain atau minta pengawas melepas lock dari Proctor Monitor.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
