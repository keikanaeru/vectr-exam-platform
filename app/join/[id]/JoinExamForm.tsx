"use client";

import {
  useActionState,
} from "react";

import {
  loginCandidateForExam,
  type JoinState,
} from "./actions";


const initialState: JoinState = {
  error: "",
};


export default function JoinExamForm({
  examId,
}: {
  examId: string;
}) {
  // =====================================
  // BIND EXAM ID
  // =====================================

  const loginThisExam =
    loginCandidateForExam.bind(
      null,
      examId
    );


  const [
    state,
    formAction,
    pending,
  ] =
    useActionState(
      loginThisExam,
      initialState
    );


  // =====================================
  // UI
  // =====================================

  return (
    <form
      action={formAction}
      className="mt-6"
    >

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

          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-blue-400/10 bg-blue-400/[0.06] text-[10px] font-bold text-blue-300">
            ID
          </div>

        </div>


        <input
          id="candidate_code"
          name="candidate_code"
          placeholder="PSRT-001"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={pending}
          className="candidate-input w-full py-3.5 pl-12 pr-4 uppercase disabled:cursor-not-allowed disabled:opacity-60"
        />

      </div>


      <p className="mt-2 text-[11px] leading-5 text-slate-600">
        Gunakan kode peserta yang diberikan
        oleh penyelenggara.
      </p>


      {/* ================================= */}
      {/* ACCESS CODE */}
      {/* ================================= */}

      <label
        htmlFor="access_code"
        className="mt-5 block text-sm font-medium text-slate-300"
      >
        Kode Akses Ujian
      </label>


      <div className="relative mt-2">

        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">

          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-400/10 bg-violet-400/[0.06] text-[11px] font-bold text-violet-300">
            *
          </div>

        </div>


        <input
          id="access_code"
          name="access_code"
          type="password"
          placeholder="Masukkan kode akses"
          required
          autoComplete="off"
          disabled={pending}
          className="candidate-input w-full py-3.5 pl-12 pr-4 disabled:cursor-not-allowed disabled:opacity-60"
        />

      </div>


      <p className="mt-2 text-[11px] leading-5 text-slate-600">
        Kode akses berlaku khusus untuk
        ujian yang dibuka melalui link ini.
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
                Tidak dapat masuk
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

            Memeriksa akses...

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
      {/* SECURITY NOTE */}
      {/* ================================= */}

      <div className="candidate-divider my-5" />


      <div className="flex items-start gap-3">

        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />


        <p className="text-[11px] leading-5 text-slate-600">
          Link ini hanya menentukan ujian tujuan.
          Peserta tetap harus terdaftar pada ujian
          dan memiliki kode akses yang benar.
        </p>

      </div>

    </form>
  );
}
