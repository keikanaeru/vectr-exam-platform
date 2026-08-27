"use client";

import { useState } from "react";

type ExportFormat = "docx" | "pdf" | "xlsx";

const EXPORTS: Array<{
  format: ExportFormat;
  label: string;
}> = [
  { format: "docx", label: "Word" },
  { format: "pdf", label: "PDF" },
  { format: "xlsx", label: "Excel" },
];

function getDownloadName(
  response: Response,
  fallback: string
) {
  const disposition =
    response.headers.get("content-disposition") ?? "";

  const utf8Match = disposition.match(
    /filename\*=UTF-8''([^;]+)/i
  );

  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(
        utf8Match[1].replace(/^["']|["']$/g, "")
      );
    } catch {
      return utf8Match[1];
    }
  }

  const normalMatch = disposition.match(
    /filename="?([^";]+)"?/i
  );

  return normalMatch?.[1] || fallback;
}

export default function ResultDownloadButtons({
  examId,
}: {
  examId: string;
}) {
  const [active, setActive] =
    useState<ExportFormat | null>(null);

  const [elapsed, setElapsed] =
    useState(0);

  const [notice, setNotice] =
    useState<{
      type: "loading" | "success" | "error";
      text: string;
    } | null>(null);

  async function download(
    format: ExportFormat,
    label: string
  ) {
    if (active !== null) return;

    const startedAt = Date.now();

    setActive(format);
    setElapsed(0);

    setNotice({
      type: "loading",
      text: `Menyiapkan ${label}...`,
    });

    const timer = window.setInterval(() => {
      setElapsed(
        Math.floor(
          (Date.now() - startedAt) / 1000
        )
      );
    }, 1000);

    try {
      const response = await fetch(
        `/admin/exams/${examId}/results/${format}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        }
      );

      if (!response.ok) {
        const message = await response.text();

        throw new Error(
          message.trim() ||
            `HTTP ${response.status}`
        );
      }

      const blob = await response.blob();

      const fileName = getDownloadName(
        response,
        `hasil-ujian.${format}`
      );

      const objectUrl =
        window.URL.createObjectURL(blob);

      const anchor =
        document.createElement("a");

      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.style.display = "none";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => {
        window.URL.revokeObjectURL(objectUrl);
      }, 1500);

      const seconds = Math.max(
        1,
        Math.round(
          (Date.now() - startedAt) / 1000
        )
      );

      setNotice({
        type: "success",
        text: `${label} siap dan mulai diunduh dalam ${seconds} detik.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? `Gagal menyiapkan ${label}: ${error.message}`
            : `Gagal menyiapkan ${label}.`,
      });
    } finally {
      window.clearInterval(timer);
      setActive(null);
    }
  }

  return (
    <>
      {EXPORTS.map(({ format, label }) => {
        const isActive = active === format;
        const disabled = active !== null;

        return (
          <button
            key={format}
            type="button"
            disabled={disabled}
            onClick={() =>
              void download(format, label)
            }
            className="liquid-button flex items-center justify-center gap-2 rounded-[12px] px-3 py-2.5 text-xs font-semibold text-slate-300 disabled:cursor-wait disabled:opacity-50"
          >
            {isActive ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
                />

                <span>
                  {elapsed > 0
                    ? `${elapsed}s`
                    : label}
                </span>
              </>
            ) : (
              label
            )}
          </button>
        );
      })}

      {notice ? (
        <div
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-[100] w-[min(390px,calc(100vw-3rem))] rounded-[18px] border p-4 shadow-2xl backdrop-blur-xl ${
            notice.type === "loading"
              ? "border-cyan-400/20 bg-slate-950/95 text-cyan-100"
              : notice.type === "success"
                ? "border-emerald-400/20 bg-slate-950/95 text-emerald-200"
                : "border-red-400/20 bg-slate-950/95 text-red-200"
          }`}
        >
          <div className="flex items-start gap-3">
            {notice.type === "loading" ? (
              <span
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-cyan-300 border-r-transparent"
              />
            ) : null}

            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {notice.text}
              </p>

              {notice.type === "loading" ? (
                <>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Hasil ujian sedang diproses.
                    Jangan tutup halaman ini.
                  </p>

                  <p className="mt-2 font-mono text-xs text-cyan-300">
                    Waktu tunggu: {elapsed} detik
                  </p>

                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-300/60" />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}