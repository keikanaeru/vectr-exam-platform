"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

export default function ConfirmSubmitButton({
  children,
  message,
  className = "liquid-button rounded-[13px] px-4 py-2.5 text-xs font-semibold text-slate-200",
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const dialog = open ? (
    <div
      className="admin-confirm-backdrop fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/70 px-5 py-8 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Konfirmasi tindakan"
        className="admin-confirm-dialog w-full max-w-md rounded-[22px] border border-white/[0.11] bg-[#07101f]/95 p-5 shadow-[0_30px_100px_rgba(0,0,0,.58)] backdrop-blur-2xl"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300/80">Konfirmasi</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-100">Lanjutkan tindakan ini?</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="liquid-button rounded-[12px] px-4 py-2.5 text-xs font-semibold"
          >
            Batal
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => {
              const form = formRef.current;
              setOpen(false);
              form?.requestSubmit();
            }}
            className="rounded-[12px] border border-rose-400/20 bg-rose-400/[0.08] px-4 py-2.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/[0.13]"
          >
            Ya, lanjutkan
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        title={title}
        onClick={(event) => {
          formRef.current = event.currentTarget.form;
          setOpen(true);
        }}
      >
        {children}
      </button>
      {mounted && dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
