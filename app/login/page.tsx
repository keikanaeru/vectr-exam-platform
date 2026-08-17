"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import VectrBrand from "@/app/ui/VectrBrand";
import { requestAdminPasswordReset } from "./actions";

import {
  createClient,
} from "@/lib/supabase/client";


export default function LoginPage() {
  const router =
    useRouter();


  const supabase =
    createClient();


  const [
    email,
    setEmail,
  ] =
    useState("");


  const [
    password,
    setPassword,
  ] =
    useState("");


  const [
    message,
    setMessage,
  ] =
    useState("");


  const [
    messageType,
    setMessageType,
  ] =
    useState<
      "error" |
      "info" |
      ""
    >("");


  const [
    loading,
    setLoading,
  ] =
    useState(false);


  useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get("auth_error");
    if (!authError) return;
    setMessageType("error");
    setMessage(authError);
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);


  // =====================================
  // LOGIN
  // =====================================

  async function handleLogin(
    event: FormEvent
  ) {
    event.preventDefault();


    if (loading) {
      return;
    }


    setLoading(
      true
    );


    setMessageType(
      "info"
    );


    setMessage(
      "Memeriksa akun..."
    );


    const {
      error,
    } =
      await supabase
        .auth
        .signInWithPassword({
          email:
            email.trim(),
          password,
        });


    if (error) {
      const rawMessage =
        error.message.toLowerCase();


      let friendlyMessage =
        "Login gagal. Periksa email dan password lalu coba lagi.";


      if (
        rawMessage.includes(
          "invalid login credentials"
        )
      ) {
        friendlyMessage =
          "Email atau password tidak sesuai.";
      }


      if (
        rawMessage.includes(
          "email not confirmed"
        )
      ) {
        friendlyMessage =
          "Email akun belum dikonfirmasi.";
      }


      if (
        rawMessage.includes(
          "too many"
        )
      ) {
        friendlyMessage =
          "Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi.";
      }


      setMessageType(
        "error"
      );


      setMessage(
        friendlyMessage
      );


      setLoading(
        false
      );


      return;
    }


    setMessageType(
      "info"
    );


    setMessage(
      "Login berhasil. Membuka workspace..."
    );


    router.replace(
      "/admin"
    );


    router.refresh();
  }


  async function handleForgotPassword() {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setMessageType("error");
      setMessage("Isi email terlebih dahulu, lalu klik Lupa password.");
      return;
    }

    setLoading(true);
    setMessageType("info");
    setMessage("Mengirim link recovery...");

    const result = await requestAdminPasswordReset(normalizedEmail);

    setLoading(false);
    setMessageType(result.ok ? "info" : "error");
    setMessage(result.message);
  }

  // =====================================
  // UI
  // =====================================

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">

      {/* ================================= */}
      {/* BACKGROUND GLOW */}
      {/* ================================= */}

      <div className="pointer-events-none fixed inset-0">

        <div className="absolute -left-40 top-1/4 h-[420px] w-[420px] rounded-full bg-blue-500/[0.08] blur-[130px]" />

        <div className="absolute -right-40 top-1/3 h-[420px] w-[420px] rounded-full bg-violet-500/[0.08] blur-[130px]" />

        <div className="absolute bottom-[-180px] left-1/2 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-cyan-500/[0.05] blur-[130px]" />

      </div>


      {/* ================================= */}
      {/* LOGIN CONTAINER */}
      {/* ================================= */}

      <div className="liquid-enter relative z-10 w-full max-w-md">

        {/* ================================= */}
        {/* BRAND */}
        {/* ================================= */}

        <div className="mb-7 text-center">

          <VectrBrand centered className="mx-auto w-fit" subtitle="Exam Platform" />


          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
            Login Admin
          </h1>


          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">
            Masuk untuk mengelola workspace,
            peserta, modul, dan pelaksanaan ujian.
          </p>

        </div>


        {/* ================================= */}
        {/* LOGIN CARD */}
        {/* ================================= */}

        <form
          onSubmit={
            handleLogin
          }
          className="liquid-card overflow-hidden p-6 sm:p-7"
        >

          <div className="relative z-10">

            {/* ================================= */}
            {/* WORKSPACE INFO */}
            {/* ================================= */}

            <div className="mb-6 flex items-center gap-3 rounded-[18px] border border-white/[0.055] bg-white/[0.022] px-4 py-3">

              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06]">

                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />

              </div>


              <div>

                <p className="text-xs font-medium text-slate-300">
                  Administrasi Platform
                </p>


                <p className="mt-0.5 text-[10px] text-slate-600">
                  Secure admin authentication
                </p>

              </div>

            </div>


            {/* ================================= */}
            {/* EMAIL */}
            {/* ================================= */}

            <label
              htmlFor="email"
              className="text-sm text-slate-400"
            >
              Email
            </label>


            <div className="relative mt-2">

              <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">

                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-4 w-4 text-slate-600"
                  aria-hidden="true"
                >
                  <path
                    d="M4 6.5h16v11H4v-11Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />

                  <path
                    d="m5 7.5 7 5 7-5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>

              </div>


              <input
                id="email"
                type="email"
                value={
                  email
                }
                onChange={
                  (
                    event
                  ) =>
                    setEmail(
                      event.target.value
                    )
                }
                placeholder="admin@example.com"
                required
                autoComplete="email"
                disabled={
                  loading
                }
                className="liquid-input w-full py-3.5 pl-11 pr-4 disabled:cursor-not-allowed disabled:opacity-60"
              />

            </div>


            {/* ================================= */}
            {/* PASSWORD */}
            {/* ================================= */}

            <label
              htmlFor="password"
              className="mt-5 block text-sm text-slate-400"
            >
              Password
            </label>


            <div className="relative mt-2">

              <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">

                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-4 w-4 text-slate-600"
                  aria-hidden="true"
                >
                  <rect
                    x="5"
                    y="10"
                    width="14"
                    height="10"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />

                  <path
                    d="M8 10V7a4 4 0 0 1 8 0v3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>

              </div>


              <input
                id="password"
                type="password"
                value={
                  password
                }
                onChange={
                  (
                    event
                  ) =>
                    setPassword(
                      event.target.value
                    )
                }
                placeholder="Masukkan password"
                required
                autoComplete="current-password"
                disabled={
                  loading
                }
                className="liquid-input w-full py-3.5 pl-11 pr-4 disabled:cursor-not-allowed disabled:opacity-60"
              />

            </div>


            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="text-[11px] font-medium text-cyan-300/70 transition hover:text-cyan-200 disabled:opacity-40"
              >
                Lupa password?
              </button>
            </div>


            {/* ================================= */}
            {/* MESSAGE */}
            {/* ================================= */}

            {message && (

              <div
                className={
                  messageType ===
                  "error"
                    ? "mt-5 rounded-[18px] border border-rose-400/15 bg-rose-400/[0.045] p-4"
                    : "mt-5 rounded-[18px] border border-blue-400/15 bg-blue-400/[0.04] p-4"
                }
              >

                <div className="flex items-start gap-3">

                  <div
                    className={
                      messageType ===
                      "error"
                        ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-rose-400/15 bg-rose-400/[0.07] text-[10px] font-bold text-rose-300"
                        : "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-400/[0.07] text-[10px] font-bold text-blue-300"
                    }
                  >
                    {messageType ===
                    "error"
                      ? "!"
                      : "•"}
                  </div>


                  <p
                    className={
                      messageType ===
                      "error"
                        ? "pt-1 text-xs leading-5 text-rose-200/80"
                        : "pt-1 text-xs leading-5 text-blue-200/75"
                    }
                  >
                    {message}
                  </p>

                </div>

              </div>

            )}


            {/* ================================= */}
            {/* LOGIN BUTTON */}
            {/* ================================= */}

            <button
              type="submit"
              disabled={
                loading
              }
              className="liquid-button-primary mt-6 flex w-full items-center justify-center gap-2 rounded-[15px] px-4 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >

              {loading && (

                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />

              )}


              <span>
                {loading
                  ? "Memproses..."
                  : "Masuk"}
              </span>

            </button>


            {/* ================================= */}
            {/* SECURITY NOTE */}
            {/* ================================= */}

            <div className="liquid-divider my-6" />


            <div className="flex items-center justify-center gap-2 text-center">

              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />


              <p className="text-[10px] leading-5 text-slate-600">
                Akses workspace ditentukan berdasarkan
                akun dan organisasi yang terdaftar.
              </p>

            </div>

          </div>

        </form>


        {/* ================================= */}
        {/* FOOTER */}
        {/* ================================= */}

        <div className="mt-6 text-center">

          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-700">
            VECTR Exam Platform Administration
          </p>

        </div>

      </div>

    </main>
  );
}