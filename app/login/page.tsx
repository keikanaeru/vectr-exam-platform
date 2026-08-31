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
    <main className="admin-auth-page relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">

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

        <div className="admin-auth-brand">

          <VectrBrand centered className="mx-auto w-fit" subtitle="Exam Platform" />


          <h1 className="admin-auth-title">
            Login Admin
          </h1>


          <p className="admin-auth-description">
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
          className="admin-auth-card"
        >

          <div className="relative z-10">

            {/* ================================= */}
            {/* WORKSPACE INFO */}
            {/* ================================= */}

            <div className="admin-auth-context">

              <div className="admin-auth-context__signal">

                <span />

              </div>


              <div>

                <strong>
                  Administrasi Platform
                </strong>


                <p>
                  Secure admin authentication
                </p>

              </div>

            </div>


            {/* ================================= */}
            {/* EMAIL */}
            {/* ================================= */}

            <label
              htmlFor="email"
              className="admin-auth-label"
            >
              Email
            </label>


            <div className="admin-auth-input-wrap">

              <div className="admin-auth-input-icon">

                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-4 w-4"
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
                className="admin-auth-input"
              />

            </div>


            {/* ================================= */}
            {/* PASSWORD */}
            {/* ================================= */}

            <label
              htmlFor="password"
              className="admin-auth-label mt-5"
            >
              Password
            </label>


            <div className="admin-auth-input-wrap">

              <div className="admin-auth-input-icon">

                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-4 w-4"
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
                className="admin-auth-input"
              />

            </div>


            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="admin-auth-forgot"
              >
                Lupa password?
              </button>
            </div>


            {/* ================================= */}
            {/* MESSAGE */}
            {/* ================================= */}

            {message && (

              <div
                role={messageType === "error" ? "alert" : "status"}
                aria-live={messageType === "error" ? "assertive" : "polite"}
                data-tone={messageType || "info"}
                className="admin-auth-message"
              >

                <div className="flex items-start gap-3">

                  <div
                    className="admin-auth-message__signal"
                  >
                    {messageType ===
                    "error"
                      ? "!"
                      : "•"}
                  </div>


                  <p>
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
              className="admin-auth-submit"
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

            <div className="admin-auth-security">

              <span />


              <p>
                Akses workspace ditentukan berdasarkan
                akun dan organisasi yang terdaftar.
              </p>

            </div>

          </div>

        </form>


        {/* ================================= */}
        {/* FOOTER */}
        {/* ================================= */}

        <div className="admin-auth-footer">

          <p>
            VECTR Exam Platform Administration
          </p>

        </div>

      </div>

    </main>
  );
}
