"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import type { OrganizationSubscriptionState } from "@/lib/organization-subscription";

function isWriteForm(form: HTMLFormElement) {
  if (form.method.toLowerCase() === "post") return true;
  return Boolean(form.querySelector('input[name^="$ACTION_"]'));
}

export default function AdminSubscriptionGate({
  state,
  isPlatformOwner,
  children,
}: {
  state: OrganizationSubscriptionState;
  isPlatformOwner: boolean;
  children: ReactNode;
}) {
  const [blocked, setBlocked] = useState(false);

  if (!isPlatformOwner && (state.mode === "PURGE_DUE" || state.mode === "SUSPENDED" || state.mode === "MISSING")) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16 sm:px-8">
        <section className="liquid-card p-8 text-center sm:p-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-rose-300/75">Akses Workspace</p>
          <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
            {state.mode === "PURGE_DUE" ? "Masa retensi sudah berakhir" : state.mode === "SUSPENDED" ? "Langganan ditangguhkan" : "Status langganan belum siap"}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            {state.mode === "PURGE_DUE"
              ? "Data tidak lagi dapat dibuka dari akun organisasi. Hubungi pengelola platform untuk perpanjangan atau proses penghapusan permanen."
              : state.mode === "SUSPENDED"
                ? state.suspensionReason || "Akses organisasi sedang ditangguhkan oleh pengelola platform."
                : "Konfigurasi langganan organisasi belum lengkap. Hubungi pengelola platform."}
          </p>
        </section>
      </main>
    );
  }

  const readOnly = !isPlatformOwner && state.mode === "EXPORT_ONLY";

  const onSubmitCapture = (event: FormEvent<HTMLDivElement>) => {
    if (!readOnly) return;
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form || !isWriteForm(form)) return;
    event.preventDefault();
    event.stopPropagation();
    setBlocked(true);
  };

  return (
    <div
      data-subscription-readonly={readOnly ? "true" : "false"}
      onSubmitCapture={onSubmitCapture}
    >
      {blocked ? (
        <div className="fixed bottom-5 right-5 z-[500] max-w-md rounded-[18px] border border-amber-400/25 bg-[#14100a]/95 px-4 py-3 text-sm text-amber-100 shadow-2xl backdrop-blur-2xl">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Workspace hanya-baca</p>
              <p className="mt-1 text-xs leading-5 text-amber-100/70">Masa aktif sudah berakhir. Anda masih bisa melihat dan mengekspor data, tetapi perubahan data dinonaktifkan.</p>
            </div>
            <button type="button" onClick={() => setBlocked(false)} className="text-amber-100/60 hover:text-amber-100" aria-label="Tutup">×</button>
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}
