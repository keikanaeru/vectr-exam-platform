import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  verifyCandidateSessionToken,
} from "@/lib/candidate-session";
import { getExamPolicy } from "@/lib/exam-policy";
import { calculateSectionScores } from "@/lib/exam-sections";
import { getOrganizationBranding } from "@/lib/organization-branding";
import CandidateThemeToggle from "@/app/candidate/ui/CandidateThemeToggle";
import CandidateBrand from "@/app/candidate/ui/CandidateBrand";
import PoweredBy from "@/app/candidate/ui/PoweredBy";


export const dynamic =
  "force-dynamic";


function formatWib(
  value: string | null
) {
  if (!value) {
    return "-";
  }


  return new Intl.DateTimeFormat(
    "id-ID",
    {
      timeZone:
        "Asia/Jakarta",

      dateStyle:
        "medium",

      timeStyle:
        "short",
    }
  ).format(
    new Date(value)
  );
}


export default async function ResultPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  // =====================================
  // EXAM ID
  // =====================================

  const {
    id: examId,
  } =
    await params;


  // =====================================
  // CANDIDATE SESSION
  // =====================================

  const cookieStore =
    await cookies();


  const token =
    cookieStore.get(
      "candidate_session"
    )?.value;


  const candidateSession =
    verifyCandidateSessionToken(
      token
    );


  if (!candidateSession) {
    redirect(
      "/candidate/login"
    );
  }


  if (
    candidateSession.examId !==
    examId
  ) {
    redirect(
      "/candidate"
    );
  }


  const supabase =
    createAdminClient();


  // =====================================
  // EXAM SESSION
  // =====================================

  const {
    data: examSession,
    error: sessionError,
  } =
    await supabase
      .from(
        "exam_sessions"
      )
      .select(
        `
        id,
        status,
        submitted_at
        `
      )
      .eq(
        "assignment_id",
        candidateSession.assignmentId
      )
      .order(
        "attempt_no",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();


  if (
    sessionError
  ) {
    console.error(
      "LOAD RESULT SESSION ERROR:",
      sessionError
    );

    throw new Error(
      "Gagal membaca sesi ujian."
    );
  }


  if (!examSession) {
    redirect(
      "/candidate"
    );
  }


  if (
    examSession.status !==
    "SUBMITTED"
  ) {
    redirect(
      `/candidate/exam/${examId}/take`
    );
  }


  // =====================================
  // RESULT
  // =====================================

  const {
    data: result,
    error: resultError,
  } =
    await supabase
      .from("results")
      .select(
        `
        raw_score,
        max_score,
        correct_count,
        wrong_count,
        blank_count,
        final_score
        `
      )
      .eq(
        "session_id",
        examSession.id
      )
      .maybeSingle();


  if (
    resultError
  ) {
    console.error(
      "LOAD RESULT ERROR:",
      resultError
    );

    throw new Error(
      "Gagal membaca hasil ujian."
    );
  }


  if (!result) {
    throw new Error(
      "Hasil ujian tidak ditemukan."
    );
  }


  // =====================================
  // CANDIDATE
  // =====================================

  const {
    data: candidate,
  } =
    await supabase
      .from("candidates")
      .select(
        `
        id,
        candidate_code,
        display_name
        `
      )
      .eq(
        "id",
        candidateSession.candidateId
      )
      .maybeSingle();


  // =====================================
  // EXAM
  // =====================================

  const {
    data: exam,
  } =
    await supabase
      .from("exams")
      .select(
        `
        id,
        organization_id,
        module_id,
        title,
        settings
        `
      )
      .eq(
        "id",
        examId
      )
      .maybeSingle();


  // =====================================
  // MODULE
  // =====================================

  let moduleInfo:
    {
      id: string;
      code: string | null;
      name: string | null;
    } |
    null = null;


  if (
    exam?.module_id
  ) {
    const {
      data: moduleData,
    } =
      await supabase
        .from("modules")
        .select(
          `
          id,
          code,
          name
          `
        )
        .eq(
          "id",
          exam.module_id
        )
        .maybeSingle();


    moduleInfo =
      moduleData;
  }


  const policy =
    getExamPolicy(
      exam?.settings
    );

  const sectionScores = exam
    ? await calculateSectionScores(supabase, examId, String(examSession.id))
    : [];

  let branding = { displayName: "VECTR Exam Platform", logoUrl: null as string | null, showPoweredBy: false };
  if (exam?.organization_id) {
    const { data: org } = await supabase.from("organizations").select("name").eq("id", exam.organization_id).maybeSingle();
    branding = await getOrganizationBranding(String(exam.organization_id), org?.name ? String(org.name) : "VECTR Exam Platform");
  }


  // =====================================
  // RESULT VALUES
  // =====================================

  const finalScore =
    Number(
      result.final_score
    );


  const rawScore =
    Number(
      result.raw_score
    );


  const maxScore =
    Number(
      result.max_score
    );


  const correctCount =
    Number(
      result.correct_count
    );


  const wrongCount =
    Number(
      result.wrong_count
    );


  const blankCount =
    Number(
      result.blank_count
    );


  const totalQuestions =
    correctCount +
    wrongCount +
    blankCount;


  const answeredCount =
    correctCount +
    wrongCount;


  const completionRate =
    totalQuestions > 0
      ? Math.round(
          (
            answeredCount /
            totalQuestions
          ) *
          100
        )
      : 0;


  const scoreProgress =
    Math.max(
      0,
      Math.min(
        100,
        finalScore
      )
    );


  // =====================================
  // UI
  // =====================================

  return (
    <main className="candidate-surface relative min-h-screen overflow-hidden px-6 py-10 sm:py-14">
      <div className="fixed right-4 top-4 z-[80]"><CandidateThemeToggle /></div>

      {/* ================================= */}
      {/* BACKGROUND GLOW */}
      {/* ================================= */}

      <div className="pointer-events-none fixed inset-0">

        <div className="absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-emerald-500/[0.07] blur-[120px]" />

        <div className="absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-blue-500/[0.07] blur-[120px]" />

        <div className="absolute bottom-0 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-500/[0.05] blur-[110px]" />

      </div>


      {/* ================================= */}
      {/* RESULT */}
      {/* ================================= */}

      <div className="liquid-enter relative z-10 mx-auto w-full max-w-3xl">

        {/* ================================= */}
        {/* BRAND */}
        {/* ================================= */}

        <div className="mb-6 text-center">

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 bg-white/[0.05] backdrop-blur-xl">

            <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.07]">

              <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/20 via-blue-400/10 to-violet-400/20" />

              <span className="relative text-lg font-bold text-emerald-200">
                ✓
              </span>

            </div>

          </div>


          <div className="mt-5 flex justify-center">
            <CandidateBrand displayName={branding.displayName} logoUrl={branding.logoUrl} subtitle="Hasil Ujian" />
          </div>


          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ujian Selesai
          </h1>


          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
            Jawaban Anda telah berhasil dikirim dan
            hasil ujian sudah dihitung.
          </p>

        </div>


        {/* ================================= */}
        {/* RESULT CARD */}
        {/* ================================= */}

        <section className="liquid-card overflow-hidden p-6 sm:p-8">

          <div className="relative z-10">

            {/* ================================= */}
            {/* EXAM INFO */}
            {/* ================================= */}

            <div className="text-center">

              <div className="flex flex-wrap items-center justify-center gap-2">

                {(sectionScores.length > 1 || moduleInfo?.code) && (

                  <span className="font-mono text-xs tracking-wider text-blue-300/70">
                    {sectionScores.length > 1 ? `${sectionScores.length} SESI MODUL` : moduleInfo?.code}
                  </span>

                )}


                <span className="liquid-badge liquid-badge-success px-2.5 py-1 text-[10px] font-semibold">
                  SUBMITTED
                </span>

              </div>


              {exam?.title && (

                <h2 className="mt-4 text-xl font-semibold text-white sm:text-2xl">
                  {exam.title}
                </h2>

              )}


              {(sectionScores.length > 1 || moduleInfo?.name) && (

                <p className="mt-2 text-sm text-slate-500">
                  {sectionScores.length > 1
                    ? sectionScores.map((section) => section.moduleName).join(" · ")
                    : moduleInfo?.name}
                </p>

              )}

            </div>


            <div className="liquid-divider my-7" />


            {policy.results.showResultPage && policy.results.showPassFail ? (
              <div className={`mb-7 rounded-[20px] border p-5 text-center ${finalScore >= policy.results.passingScore ? "border-emerald-400/15 bg-emerald-400/[0.045]" : "border-rose-400/15 bg-rose-400/[0.045]"}`}>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-600">Status Kelulusan</p>
                <p className={`mt-2 text-xl font-bold ${finalScore >= policy.results.passingScore ? "text-emerald-200" : "text-rose-200"}`}>{finalScore >= policy.results.passingScore ? "LULUS" : "TIDAK LULUS"}</p>
                <p className="mt-1 text-[10px] text-slate-600">Passing score {policy.results.passingScore}</p>
              </div>
            ) : null}


            {!policy.results.showResultPage ? (
              <div className="rounded-[20px] border border-cyan-400/12 bg-cyan-400/[0.035] p-6 text-center">
                <p className="text-sm font-medium text-cyan-100">Hasil tidak ditampilkan langsung</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">Pengawas telah mengatur agar nilai dan rincian jawaban tidak dibuka pada halaman peserta. Submit Anda tetap tercatat.</p>
              </div>
            ) : null}

            {/* ================================= */}
            {/* SCORE */}
            {/* ================================= */}

            {policy.results.showResultPage && policy.results.showFinalScore ? <div className="text-center">

              <p className="text-xs uppercase tracking-[0.18em] text-slate-600">
                Nilai Akhir
              </p>


              <div className="relative mx-auto mt-5 flex h-44 w-44 items-center justify-center">

                {/* OUTER GLOW */}

                <div className="absolute inset-0 rounded-full bg-blue-500/[0.06] blur-2xl" />


                {/* SCORE RING */}

                <div
                  className="absolute inset-0 rounded-full p-[2px]"
                  style={{
                    background:
                      `conic-gradient(
                        rgba(96, 165, 250, 0.95) ${scoreProgress}%,
                        rgba(255, 255, 255, 0.06) ${scoreProgress}%
                      )`,
                  }}
                >

                  <div className="candidate-score-core h-full w-full rounded-full" />

                </div>


                {/* SCORE VALUE */}

                <div className="relative">

                  <p className="text-5xl font-bold tracking-tight text-white">
                    {
                      finalScore.toFixed(
                        2
                      )
                    }
                  </p>


                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-600">
                    Score
                  </p>

                </div>

              </div>


              <p className="mt-4 text-xs text-slate-500">
                Skor mentah{" "}
                <span className="font-medium text-slate-300">
                  {rawScore}
                </span>
                {" / "}
                <span className="font-medium text-slate-300">
                  {maxScore}
                </span>
              </p>

            </div> : null}


            {/* ================================= */}
            {/* SUMMARY */}
            {/* ================================= */}

            {policy.results.showResultPage && policy.results.showScoreBreakdown ? <div className="mt-8 grid gap-3 sm:grid-cols-3">

              {/* CORRECT */}

              <div className="rounded-[20px] border border-emerald-400/12 bg-emerald-400/[0.045] p-4 text-center">

                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.07] text-xs font-bold text-emerald-300">
                  ✓
                </div>


                <p className="mt-3 text-2xl font-bold text-emerald-300">
                  {correctCount}
                </p>


                <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-600">
                  Benar
                </p>

              </div>


              {/* WRONG */}

              <div className="rounded-[20px] border border-rose-400/12 bg-rose-400/[0.045] p-4 text-center">

                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl border border-rose-400/15 bg-rose-400/[0.07] text-xs font-bold text-rose-300">
                  ×
                </div>


                <p className="mt-3 text-2xl font-bold text-rose-300">
                  {wrongCount}
                </p>


                <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-600">
                  Salah
                </p>

              </div>


              {/* BLANK */}

              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.025] p-4 text-center">

                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-xs font-bold text-slate-400">
                  —
                </div>


                <p className="mt-3 text-2xl font-bold text-slate-300">
                  {blankCount}
                </p>


                <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-600">
                  Kosong
                </p>

              </div>

            </div> : null}


            {/* ================================= */}
            {/* DETAILS */}
            {/* ================================= */}

            {policy.results.showResultPage && policy.results.showCompletionSummary ? <div className="mt-5 rounded-[22px] border border-white/[0.06] bg-white/[0.022] p-5">

              <div className="flex items-center justify-between gap-4">

                <div>

                  <p className="text-xs text-slate-500">
                    Penyelesaian Soal
                  </p>


                  <p className="mt-1 text-sm font-medium text-slate-200">
                    {answeredCount} dari {totalQuestions} soal terjawab
                  </p>

                </div>


                <span className="text-sm font-semibold text-blue-300">
                  {completionRate}%
                </span>

              </div>


              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">

                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                  style={{
                    width:
                      `${completionRate}%`,
                  }}
                />

              </div>

            </div> : null}


            {policy.results.showResultPage && sectionScores.length > 1 ? (
              <>
                <div className="liquid-divider my-7" />
                <div>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-600">Hasil per modul</p>
                      <h3 className="mt-1 text-lg font-semibold text-white">Rincian Sesi Ujian</h3>
                    </div>
                    <span className="liquid-badge px-3 py-1.5 text-[10px] text-slate-400">{sectionScores.length} MODUL</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {sectionScores.map((score) => (
                      <div key={score.sectionId} className="rounded-[18px] border border-white/[0.065] bg-white/[0.025] p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-mono text-[10px] text-blue-300/65">{score.moduleCode}</p>
                            <p className="mt-1 text-sm font-semibold text-white">{score.moduleName}</p>
                          </div>
                          {policy.results.showFinalScore ? <span className="text-xl font-bold text-cyan-200">{score.finalScore.toFixed(2)}</span> : null}
                        </div>
                        {policy.results.showScoreBreakdown ? (
                          <div className="mt-3 flex gap-4 text-[11px] text-slate-500">
                            <span>Benar <b className="text-emerald-300">{score.correctCount}</b></span>
                            <span>Salah <b className="text-rose-300">{score.wrongCount}</b></span>
                            <span>Kosong <b className="text-slate-300">{score.blankCount}</b></span>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {/* ================================= */}
            {/* CANDIDATE INFO */}
            {/* ================================= */}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">

              <div className="rounded-[20px] border border-white/[0.055] bg-white/[0.022] p-4">

                <p className="text-[10px] uppercase tracking-wider text-slate-600">
                  Peserta
                </p>


                <p className="mt-2 text-sm font-medium text-slate-200">
                  {
                    candidate?.display_name ??
                    "-"
                  }
                </p>


                {candidate?.candidate_code && (

                  <p className="mt-1 font-mono text-[10px] text-blue-300/60">
                    {candidate.candidate_code}
                  </p>

                )}

              </div>


              <div className="rounded-[20px] border border-white/[0.055] bg-white/[0.022] p-4">

                <p className="text-[10px] uppercase tracking-wider text-slate-600">
                  Waktu Submit
                </p>


                <p className="mt-2 text-sm font-medium leading-6 text-slate-200">
                  {
                    formatWib(
                      examSession.submitted_at
                    )
                  }
                </p>


                <p className="mt-1 text-[10px] text-slate-600">
                  WIB · Asia/Jakarta
                </p>

              </div>

            </div>


            {/* ================================= */}
            {/* FINAL NOTE */}
            {/* ================================= */}

            <div className="mt-6 rounded-[20px] border border-emerald-400/12 bg-emerald-400/[0.035] p-5">

              <div className="flex items-start gap-4">

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.07] text-xs font-bold text-emerald-300">
                  ✓
                </div>


                <div>

                  <p className="text-sm font-medium text-emerald-200">
                    Jawaban telah tersimpan
                  </p>


                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Sesi ujian sudah ditutup dan hasil ini
                    tercatat pada sistem.
                  </p>

                </div>

              </div>

            </div>

          </div>

        </section>


        {/* ================================= */}
        {/* FOOTER */}
        {/* ================================= */}

        <p className="mt-6 text-center text-[10px] tracking-[0.16em] text-slate-700">
          EXAM COMPLETED
        </p>

      </div>

          <PoweredBy show={branding.showPoweredBy} />
</main>
  );
}