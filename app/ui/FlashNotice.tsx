"use client";

import { useCallback, useEffect, useState } from "react";

const DEFAULT_FLASH_QUERY_KEYS = ["error", "success"];

export default function FlashNotice({
  tone,
  message,
  autoDismissMs,
  clearQueryKeys = DEFAULT_FLASH_QUERY_KEYS,
}: {
  tone: "success" | "error" | "warning" | "info";
  message: string;
  autoDismissMs?: number | null;
  clearQueryKeys?: string[];
}) {
  const [visible, setVisible] = useState(true);
  const dismissAfter = autoDismissMs === undefined ? (tone === "success" ? 5500 : null) : autoDismissMs;

  const clearUrlFlash = useCallback(() => {
    if (typeof window === "undefined" || !clearQueryKeys.length) return;
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of clearQueryKeys) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) {
      const search = url.searchParams.toString();
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${search ? `?${search}` : ""}${url.hash}`
      );
    }
  }, [clearQueryKeys]);

  const dismiss = useCallback(() => {
    setVisible(false);
    clearUrlFlash();
  }, [clearUrlFlash]);

  useEffect(() => {
    setVisible(true);
    // Query flash adalah transport sekali-pakai. Bersihkan URL segera setelah
    // pesan sudah ter-render supaya refresh/back tidak menghidupkan error lama.
    clearUrlFlash();
    if (!dismissAfter) return;
    const timer = window.setTimeout(dismiss, dismissAfter);
    return () => window.clearTimeout(timer);
  }, [message, dismissAfter, dismiss, clearUrlFlash]);

  if (!visible || !message) return null;

  const title = tone === "success"
    ? "Berhasil"
    : tone === "warning"
      ? "Perhatian"
      : tone === "info"
        ? "Informasi"
        : "Aksi gagal";

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className="flash-notice-region fixed bottom-4 left-4 right-4 z-[300] sm:left-auto sm:right-5 sm:w-[min(480px,calc(100vw-40px))]"
    >
      <div className={`flash-notice flash-notice-${tone} rounded-[18px] border p-4 backdrop-blur-2xl`}>
        <div className="flex items-start gap-3">
          <span className="flash-notice-dot mt-1.5 h-2 w-2 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-80">{title}</p>
            <p className="mt-1.5 break-words text-sm leading-6 opacity-95">{message}</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Tutup notifikasi"
            className="flash-notice-close grid h-8 w-8 shrink-0 place-items-center rounded-xl border text-sm transition"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
