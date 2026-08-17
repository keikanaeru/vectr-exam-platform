"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import VectrBrand from "@/app/ui/VectrBrand";

export default function UpdatePasswordPage() {
  const [mode, setMode] = useState<"invite" | "recovery">("recovery");
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const currentMode = new URLSearchParams(window.location.search).get("mode");
    if (currentMode === "invite") setMode("invite");
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    if (password.length < 8) { setMessage("Password minimal 8 karakter."); return; }
    if (password.length > 128) { setMessage("Password maksimal 128 karakter."); return; }
    if (password !== confirmPassword) { setMessage("Konfirmasi password tidak sama."); return; }
    setLoading(true); setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setMessage("Sesi aktivasi tidak valid/kedaluwarsa atau password belum dapat diperbarui. Minta link baru."); return; }
    await supabase.auth.signOut();
    setSuccess(true);
    setMessage(mode === "invite" ? "Akun berhasil diaktifkan. Password Anda sudah tersimpan." : "Password berhasil diperbarui.");
  }

  const title = mode === "invite" ? "Aktifkan Akun" : "Password Baru";
  const description = mode === "invite"
    ? "Buat password pribadi untuk menyelesaikan aktivasi akun admin."
    : "Buat password baru untuk akun VECTR Exam Platform Anda.";

  return (
    <main className="candidate-surface relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12 text-white">
      <div className="pointer-events-none absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-blue-500/[0.08] blur-[130px]" />
      <div className="pointer-events-none absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-violet-500/[0.08] blur-[130px]" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <VectrBrand centered className="mx-auto w-fit" subtitle="Exam Platform" />
          <h1 className="mt-5 text-3xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">{description}</p>
        </div>
        <form onSubmit={submit} className="liquid-card p-6">
          <label className="block text-xs text-slate-400">Password Baru<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required className="liquid-input mt-2 w-full px-4 py-3.5" /></label>
          <label className="mt-4 block text-xs text-slate-400">Konfirmasi Password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required className="liquid-input mt-2 w-full px-4 py-3.5" /></label>
          {message ? <div className={`mt-4 rounded-[15px] border p-4 text-xs ${success ? "border-emerald-400/15 bg-emerald-400/[0.04] text-emerald-200" : "border-rose-400/15 bg-rose-400/[0.04] text-rose-200"}`}>{message}</div> : null}
          <button disabled={loading || success} className="liquid-button-primary mt-5 w-full rounded-[14px] px-4 py-3.5 text-sm font-semibold disabled:opacity-50">{loading ? "Menyimpan..." : mode === "invite" ? "Aktifkan Akun" : "Simpan Password"}</button>
          {success ? <Link href="/login" className="liquid-button mt-3 flex w-full justify-center rounded-[14px] px-4 py-3 text-xs font-semibold">Masuk ke VECTR Exam Platform</Link> : null}
        </form>
      </div>
    </main>
  );
}
