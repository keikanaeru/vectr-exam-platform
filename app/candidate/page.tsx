import Link from "next/link";

import {
  cookies,
} from "next/headers";

import {
  redirect,
} from "next/navigation";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  verifyCandidateSessionToken,
} from "@/lib/candidate-session";

import {
  logoutCandidate,
} from "./actions";
import CandidateThemeToggle from "@/app/candidate/ui/CandidateThemeToggle";
import CandidateBrand from "@/app/candidate/ui/CandidateBrand";
import PoweredBy from "@/app/candidate/ui/PoweredBy";
import { getOrganizationBranding } from "@/lib/organization-branding";
import { getOrganizationSubscriptionState } from "@/lib/organization-subscription";
import { getExamSectionsForAssignment } from "@/lib/exam-sections";
import AppIcon from "@/app/ui/AppIcon";


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


export const dynamic =
  "force-dynamic";


export default async function CandidatePage() {
  // =====================================
  // SESSION
  // =====================================

  const cookieStore =
    await cookies();


  const token =
    cookieStore.get(
      "candidate_session"
    )?.value;


  const session =
    verifyCandidateSessionToken(
      token
    );


  if (!session) {
    redirect(
      "/candidate/login"
    );
  }


  const supabase =
    createAdminClient();


  // =====================================
  // ASSIGNMENT
  // =====================================

  const {
    data: assignment,
  } =
    await supabase
      .from(
        "exam_assignments"
      )
      .select(
        `
        id,
        exam_id,
        candidate_id,
        active,
        extra_time_minutes
        `
      )
      .eq(
        "id",
        session.assignmentId
      )
      .single();


  if (
    !assignment ||
    !assignment.active ||
    assignment.candidate_id !==
      session.candidateId ||
    assignment.exam_id !==
      session.examId
  ) {
    redirect(
      "/candidate/login"
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
        assignment.candidate_id
      )
      .single();


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
        status,
        starts_at,
        hard_close_at,
        duration_minutes
        `
      )
      .eq(
        "id",
        assignment.exam_id
      )
      .single();


  const { data: activeSession } = exam
    ? await supabase
        .from("exam_sessions")
        .select("id")
        .eq("assignment_id", assignment.id)
        .eq("status", "ACTIVE")
        .order("attempt_no", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const examStatus = exam ? String(exam.status) : "";
  const canResumeClosedExam = examStatus === "CLOSED" && Boolean(activeSession);

  if (
    !candidate ||
    !exam ||
    (examStatus !== "ACTIVE" && !canResumeClosedExam)
  ) {
    redirect(
      "/candidate/login"
    );
  }


  // =====================================
  // MODULE
  // =====================================

  const {
    data: module,
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
      .single();

  const portalSections = await getExamSectionsForAssignment(supabase, String(exam.id), String(assignment.id));
  const portalModuleLabel = portalSections.length > 1
    ? portalSections.map((section) => section.moduleName).join(" → ")
    : portalSections[0]?.moduleName ?? module?.name ?? "Modul";
  const portalModuleCode = portalSections[0]?.moduleCode ?? module?.code ?? "-";


  // =====================================
  // TIME STATUS
  // =====================================

  const now =
    Date.now();


  const startMs =
    exam.starts_at
      ? new Date(
          exam.starts_at
        ).getTime()
      : 0;


  const hardCloseMs =
    exam.hard_close_at
      ? new Date(
          exam.hard_close_at
        ).getTime()
      : 0;


  const beforeStart =
    startMs > 0 &&
    now < startMs;


  const closed =
    hardCloseMs > 0 &&
    now >= hardCloseMs;


  // =====================================
  // DURATION
  // =====================================

  const extraTime =
    assignment.extra_time_minutes ??
    0;


  const totalDuration =
    exam.duration_minutes +
    extraTime;


  const branding = await getOrganizationBranding(
    String(exam.organization_id),
    "VECTR Exam Platform"
  );
  const subscription = await getOrganizationSubscriptionState(supabase, String(exam.organization_id));
  const canStartBySubscription = Boolean(activeSession) || subscription.canCandidateStart;


  // =====================================
  // UI
  // =====================================

  return (
    <main className="candidate-surface relative min-h-screen overflow-hidden">

      <div className="fixed right-4 top-4 z-[80] lg:hidden"><CandidateThemeToggle compact /></div>

      {/* ================================= */}
      {/* BACKGROUND GLOW */}
      {/* ================================= */}

      <div className="pointer-events-none fixed inset-0">

        <div className="absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-blue-500/[0.07] blur-[120px]" />

        <div className="absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-violet-500/[0.07] blur-[120px]" />

        <div className="absolute bottom-0 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-500/[0.04] blur-[120px]" />

      </div>


      {/* ================================= */}
      {/* HEADER */}
      {/* ================================= */}

      <div className="relative z-10 px-3 pt-3 sm:px-5">

        <header className="candidate-nav mx-auto max-w-5xl rounded-[24px]">

          <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">

            {/* BRAND */}

            <CandidateBrand displayName={branding.displayName} logoUrl={branding.logoUrl} subtitle="Candidate Portal" />

            {/* CONTROLS */}

            <div className="flex items-center gap-2">
              <div className="hidden lg:block"><CandidateThemeToggle /></div>
              <form
              action={
                logoutCandidate
              }
            >

              <button
                type="submit"
                className="candidate-button px-4 py-2 text-xs font-medium text-slate-300"
              >
                Keluar
              </button>

              </form>
            </div>

          </div>

        </header>

      </div>


      {/* ================================= */}
      {/* CONTENT */}
      {/* ================================= */}

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-10">

        {/* ================================= */}
        {/* WELCOME HERO */}
        {/* ================================= */}

        <section className="candidate-enter">

          <div className="relative overflow-hidden rounded-[28px] border border-white/[0.07] bg-white/[0.025] px-6 py-8 backdrop-blur-xl sm:px-8">

            <div className="pointer-events-none absolute -right-20 -top-24 h-60 w-60 rounded-full bg-blue-500/10 blur-3xl" />

            <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-violet-500/[0.07] blur-3xl" />


            <div className="relative">

              <div className="flex flex-wrap items-center gap-3">

                <span className="candidate-badge px-3 py-1.5 font-mono text-[10px] text-blue-300/80">
                  {candidate.candidate_code}
                </span>


                <span className="flex items-center gap-2 text-xs text-slate-500">

                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />

                  Sesi aktif

                </span>

              </div>


              <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Halo, {candidate.display_name}
              </h1>


              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
                Berikut ujian yang sedang terhubung
                dengan sesi Anda.
              </p>

            </div>

          </div>

        </section>


        {/* ================================= */}
        {/* EXAM CARD */}
        {/* ================================= */}

        <section className="candidate-card mt-6 overflow-hidden p-6 sm:p-8">

          <div className="relative z-10">

            {/* ================================= */}
            {/* EXAM HEADER */}
            {/* ================================= */}

            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">

              <div className="min-w-0">

                <div className="flex flex-wrap items-center gap-2">

                  {(portalSections.length > 1 || portalModuleCode) && (

                    <span className="font-mono text-xs tracking-[0.14em] text-blue-300/75">
                      {portalSections.length > 1 ? `${portalSections.length} SESI MODUL` : portalModuleCode}
                    </span>

                  )}


                  <span className={examStatus === "CLOSED" ? "candidate-badge px-2.5 py-1 text-[11px] font-semibold text-amber-200" : "candidate-badge candidate-badge-success px-2.5 py-1 text-[11px] font-semibold"}>
                    {examStatus === "CLOSED" ? "RESUME ONLY" : "ACTIVE"}
                  </span>

                </div>


                <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {exam.title}
                </h2>


                <p className="mt-2 text-sm text-slate-400">
                  {portalModuleLabel}
                </p>

              </div>


              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-400/15 bg-blue-400/[0.07] text-blue-300">
                <AppIcon name="exams" className="h-6 w-6" />
              </div>

            </div>


            {/* ================================= */}
            {/* INFO CARDS */}
            {/* ================================= */}

            <div className="mt-7 grid gap-3 sm:grid-cols-3">

              {/* DURATION */}

              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.025] p-4">

                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">
                  Durasi
                </p>


                <p className="mt-2 text-lg font-semibold text-white">
                  {totalDuration} menit
                </p>


                {extraTime > 0 && (

                  <p className="mt-1 text-[10px] text-emerald-400">
                    +{extraTime} menit tambahan
                  </p>

                )}

              </div>


              {/* START */}

              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.025] p-4">

                <div className="flex items-center gap-2">

                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />

                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">
                    Mulai
                  </p>

                </div>


                <p className="mt-2 text-sm font-medium leading-6 text-slate-200">
                  {
                    formatWib(
                      exam.starts_at
                    )
                  }
                </p>

              </div>


              {/* HARD CLOSE */}

              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.025] p-4">

                <div className="flex items-center gap-2">

                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />

                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">
                    Hard Close
                  </p>

                </div>


                <p className="mt-2 text-sm font-medium leading-6 text-slate-200">
                  {
                    formatWib(
                      exam.hard_close_at
                    )
                  }
                </p>

              </div>

            </div>


            <div className="candidate-divider my-6" />


            {/* ================================= */}
            {/* BEFORE START */}
            {/* ================================= */}

            {beforeStart && (

              <div className="rounded-[20px] border border-amber-400/15 bg-amber-400/[0.045] p-5">

                <div className="flex items-start gap-4">

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/[0.08] text-sm font-bold text-amber-300">
                    !
                  </div>


                  <div>

                    <p className="font-medium text-amber-200">
                      Ujian belum dimulai
                    </p>


                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Login Anda berhasil. Tombol mulai
                      akan tersedia setelah waktu ujian
                      dimulai.
                    </p>


                    <p className="mt-3 text-xs text-slate-500">
                      Jadwal mulai:{" "}
                      <span className="text-slate-300">
                        {
                          formatWib(
                            exam.starts_at
                          )
                        }
                      </span>
                    </p>

                  </div>

                </div>

              </div>

            )}


            {/* ================================= */}
            {/* CLOSED */}
            {/* ================================= */}

            {closed && (

              <div className="rounded-[20px] border border-rose-400/15 bg-rose-400/[0.045] p-5">

                <div className="flex items-start gap-4">

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/[0.08] text-sm font-bold text-rose-300">
                    ×
                  </div>


                  <div>

                    <p className="font-medium text-rose-200">
                      Ujian sudah ditutup
                    </p>


                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Waktu akses ujian telah melewati
                      batas hard close.
                    </p>

                  </div>

                </div>

              </div>

            )}


            {!beforeStart && !closed && !canStartBySubscription ? (
              <div className="rounded-[20px] border border-amber-400/15 bg-amber-400/[0.045] p-5">
                <p className="font-medium text-amber-100">Sesi baru sementara tidak tersedia</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">Penyelenggara sedang berada pada mode arsip. Hubungi penyelenggara untuk informasi kelanjutan ujian.</p>
              </div>
            ) : null}

            {/* ================================= */}
            {/* READY */}
            {/* ================================= */}

            {!beforeStart &&
              !closed &&
              canStartBySubscription && (

                <div>

                  <div className="mb-4 rounded-[20px] border border-emerald-400/15 bg-emerald-400/[0.045] p-4">

                    <div className="flex items-center gap-3">

                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.85)]" />


                      <div>

                        <p className="text-sm font-medium text-emerald-200">
                          Ujian siap dimulai
                        </p>


                        <p className="mt-1 text-xs text-slate-500">
                          Pastikan perangkat dan koneksi
                          internet dalam kondisi stabil.
                        </p>

                      </div>

                    </div>

                  </div>


                  <Link
                    href={`/candidate/exam/${exam.id}`}
                    className="candidate-button-primary group flex w-full items-center justify-center rounded-[16px] px-5 py-4 font-semibold"
                  >

                    <span>
                      Mulai / Lanjutkan Ujian
                    </span>


                    <span className="ml-3 transition-transform duration-200 group-hover:translate-x-1">
                      →
                    </span>

                  </Link>

                </div>

              )}

          </div>

        </section>


        {/* ================================= */}
        {/* SECURITY NOTE */}
        {/* ================================= */}

        <div className="mt-5 flex justify-center">

          <div className="flex max-w-xl items-start gap-3 text-center">

            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600" />


            <p className="text-[11px] leading-5 text-slate-600">
              Sesi peserta terhubung dengan ujian ini.
              Gunakan perangkat yang sama selama proses ujian berlangsung.
            </p>

          </div>

        </div>

      </div>

      <PoweredBy show={branding.showPoweredBy} />

    </main>
  );
}
