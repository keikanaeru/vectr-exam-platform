"use client";

import {
  useActionState,
} from "react";

import {
  loginCandidate,
  type LoginState,
} from "./actions";
import CandidateThemeToggle from "@/app/candidate/ui/CandidateThemeToggle";
import CandidateBrand from "@/app/candidate/ui/CandidateBrand";
import AppIcon from "@/app/ui/AppIcon";


const initialState: LoginState = {
  error: "",
};


export default function CandidateLoginPage() {
  const [
    state,
    formAction,
    pending,
  ] = useActionState(
    loginCandidate,
    initialState
  );


  return (
    <main className="candidate-surface relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">

      <div className="fixed right-4 top-4 z-[80]"><CandidateThemeToggle /></div>

      {/* ================================= */}
      {/* BACKGROUND GLOW */}
      {/* ================================= */}

      <div className="pointer-events-none absolute inset-0">

        <div className="absolute -left-32 top-1/4 h-80 w-80 rounded-full bg-blue-500/[0.09] blur-[100px]" />

        <div className="absolute -right-32 bottom-1/4 h-80 w-80 rounded-full bg-violet-500/[0.08] blur-[100px]" />

        <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/[0.04] blur-[100px]" />

      </div>


      {/* ================================= */}
      {/* LOGIN AREA */}
      {/* ================================= */}

      <div className="candidate-enter relative z-10 w-full max-w-md">

        {/* ================================= */}
        {/* BRAND */}
        {/* ================================= */}

        <div className="mb-6 text-center">
          <div className="flex justify-center">
            <CandidateBrand displayName="VECTR Exam Platform" subtitle="Secure Candidate Access" size="lg" />
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-white">Login Peserta</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">
            Masukkan kode peserta dan kode akses ujian untuk masuk ke ruang ujian.
          </p>
        </div>

        {/* ================================= */}
        {/* LOGIN CARD */}
        {/* ================================= */}

        <form
          action={formAction}
          className="candidate-card p-6 sm:p-7"
        >

          <div className="relative z-10">

            {/* ================================= */}
            {/* CANDIDATE CODE */}
            {/* ================================= */}

            <label
              htmlFor="candidate_code"
              className="block text-sm font-medium text-slate-300"
            >
              Kode Peserta
            </label>


            <div className="relative mt-2">

              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">

                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-blue-400/10 bg-blue-400/[0.06] text-blue-300">
                  <AppIcon name="user" className="h-3.5 w-3.5" />
                </div>

              </div>


              <input
                id="candidate_code"
                name="candidate_code"
                placeholder="PSRT-001"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                required
                disabled={pending}
                className="candidate-input w-full py-3 pl-12 pr-4 uppercase disabled:cursor-not-allowed disabled:opacity-60"
              />

            </div>


            <p className="mt-2 text-[11px] text-slate-600">
              Gunakan kode peserta yang diberikan panitia.
            </p>


            {/* ================================= */}
            {/* ACCESS CODE */}
            {/* ================================= */}

            <label
              htmlFor="access_code"
              className="mt-5 block text-sm font-medium text-slate-300"
            >
              Kode Akses
            </label>


            <div className="relative mt-2">

              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">

                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-400/10 bg-violet-400/[0.06] text-violet-300">
                  <AppIcon name="key" className="h-3.5 w-3.5" />
                </div>

              </div>


              <input
                id="access_code"
                name="access_code"
                type="password"
                placeholder="Masukkan kode akses"
                autoComplete="off"
                required
                disabled={pending}
                className="candidate-input w-full py-3 pl-12 pr-4 disabled:cursor-not-allowed disabled:opacity-60"
              />

            </div>


            <p className="mt-2 text-[11px] text-slate-600">
              Kode akses diberikan oleh penyelenggara ujian.
            </p>


            {/* ================================= */}
            {/* ERROR */}
            {/* ================================= */}

            {state.error && (

              <div role="alert" aria-live="assertive" className="mt-5 rounded-[18px] border border-rose-400/15 bg-rose-400/[0.055] p-4">

                <div className="flex items-start gap-3">

                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-400/15 bg-rose-400/[0.08] text-xs font-bold text-rose-300">
                    !
                  </div>


                  <div>

                    <p className="text-xs font-medium text-rose-300">
                      Login gagal
                    </p>

                    <p className="mt-1 text-sm leading-5 text-rose-200/80">
                      {state.error}
                    </p>

                  </div>

                </div>

              </div>

            )}


            {/* ================================= */}
            {/* SUBMIT */}
            {/* ================================= */}

            <button
              type="submit"
              disabled={pending}
              className="candidate-button-primary group mt-6 flex w-full items-center justify-center rounded-[15px] px-5 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >

              {pending ? (

                <span className="flex items-center gap-3">

                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />

                  Memeriksa...

                </span>

              ) : (

                <span className="flex items-center gap-3">

                  Masuk ke Ujian

                  <span className="transition-transform duration-200 group-hover:translate-x-1">
                    →
                  </span>

                </span>

              )}

            </button>


            {/* ================================= */}
            {/* FOOT NOTE */}
            {/* ================================= */}

            <div className="candidate-divider my-5" />


            <div className="flex items-start gap-3">

              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />

              <p className="text-[11px] leading-5 text-slate-600">
                Pastikan kode peserta dan kode akses sesuai.
                Jangan membagikan kode akses ujian kepada pihak lain.
              </p>

            </div>

          </div>

        </form>


        {/* ================================= */}
        {/* FOOTER */}
        {/* ================================= */}

        <p className="mt-5 text-center text-[10px] tracking-wide text-slate-700">
          SECURE EXAM ACCESS
        </p>

      </div>

    </main>
  );
}
