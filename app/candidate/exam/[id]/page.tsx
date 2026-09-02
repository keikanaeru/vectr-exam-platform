import { cookies } from "next/headers";

import {
  redirect,
  notFound,
} from "next/navigation";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  verifyCandidateSessionToken,
} from "@/lib/candidate-session";
import { getExamPolicy } from "@/lib/exam-policy";
import { getExamSectionsForAssignment } from "@/lib/exam-sections";
import { getOrganizationBranding } from "@/lib/organization-branding";
import { getOrganizationSubscriptionState } from "@/lib/organization-subscription";
import CandidateThemeToggle from "@/app/candidate/ui/CandidateThemeToggle";
import CandidateBrand from "@/app/candidate/ui/CandidateBrand";
import PoweredBy from "@/app/candidate/ui/PoweredBy";
import AppIcon from "@/app/ui/AppIcon";
import FlashNotice from "@/app/ui/FlashNotice";

import {
  startOrResumeExam,
} from "./actions";
import StartAvailabilityButton from "./StartAvailabilityButton";


export const dynamic =
  "force-dynamic";

function formatWib(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}


export default async function CandidateExamPage({
  params,
  searchParams,
}: {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{ error?: string }>;
}) {
  // =====================================
  // EXAM ID
  // =====================================

  const {
    id: examId,
  } =
    await params;

  const query = await searchParams;

  // R6.2/R6.3 pernah menulis pesan generik ini ke query string. Source R6.4
  // tidak lagi menghasilkan pesan tersebut; bersihkan bookmark/refresh lama agar
  // peserta tidak mengira error historis sebagai hasil percobaan terbaru.
  if (query.error === "Sesi ujian belum dapat dimulai. Periksa jadwal atau hubungi pengawas.") {
    redirect(`/candidate/exam/${examId}`);
  }


  // =====================================
  // CANDIDATE SESSION
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


  if (
    session.examId !== examId
  ) {
    redirect(
      "/candidate"
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
      .from("exam_assignments")
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
      .eq(
        "active",
        true
      )
      .single();


  if (!assignment) {
    redirect(
      "/candidate/login"
    );
  }


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
        duration_minutes,
        settings
        `
      )
      .eq(
        "id",
        examId
      )
      .single();


  if (!exam) {
    notFound();
  }


  const { data: activeSession } = await supabase
    .from("exam_sessions")
    .select("id")
    .eq("assignment_id", assignment.id)
    .eq("status", "ACTIVE")
    .order("attempt_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  const examStatus = String(exam.status);
  const canResumeClosedExam = examStatus === "CLOSED" && Boolean(activeSession);

  if (examStatus !== "ACTIVE" && !canResumeClosedExam) {
    redirect(
      "/candidate"
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
        session.candidateId
      )
      .single();


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


  const sections = await getExamSectionsForAssignment(supabase, examId, String(assignment.id));
  const effectiveSections = sections.length ? sections : [{
    id: "legacy", module_id: String(exam.module_id), order_index: 1, duration_minutes: Number(exam.duration_minutes),
    exam_id: examId, moduleCode: module?.code ? String(module.code) : "-", moduleName: module?.name ? String(module.name) : "Modul",
  }];
  const effectiveModuleCode = effectiveSections[0]?.moduleCode ?? module?.code ?? "-";

  const { data: org } = await supabase.from("organizations").select("name").eq("id", exam.organization_id).maybeSingle();
  const branding = await getOrganizationBranding(String(exam.organization_id), org?.name ? String(org.name) : "VECTR Exam Platform");
  const subscription = await getOrganizationSubscriptionState(supabase, String(exam.organization_id));
  const canStartBySubscription = Boolean(activeSession) || subscription.canCandidateStart;

  // =====================================
  // QUESTION COUNT
  // =====================================

  const moduleIds = [...new Set(effectiveSections.map((section) => section.module_id))];
  const { count: questionCount } = moduleIds.length
    ? await supabase.from("questions").select("*", { count: "exact", head: true }).in("module_id", moduleIds).eq("status", "ACTIVE")
    : { count: 0 };
  const totalQuestionCount = questionCount ?? 0;


  // =====================================
  // DURASI FINAL
  // =====================================

  const extraTime =
    assignment.extra_time_minutes ??
    0;


  const totalDuration =
    exam.duration_minutes +
    extraTime;

  const policy =
    getExamPolicy(
      exam.settings
    );


  // =====================================
  // SERVER ACTION
  // =====================================

  const startThisExam =
    startOrResumeExam.bind(
      null,
      examId
    );


  // =====================================
  // UI
  // =====================================

  return (
    <main className="candidate-surface min-h-screen">
      {query.error ? <FlashNotice tone="error" message={query.error} /> : null}
      <div className="fixed right-4 top-4 z-[80]"><CandidateThemeToggle /></div>

      {/* ================================= */}
      {/* HEADER */}
      {/* ================================= */}

      <div className="px-3 pt-3 sm:px-5">

        <header className="candidate-nav mx-auto max-w-5xl rounded-[24px]">

          <div className="flex items-center justify-between px-5 py-4 sm:px-6">

            <div className="flex items-center gap-3">

              <CandidateBrand displayName={branding.displayName} logoUrl={branding.logoUrl} subtitle="Persiapan Ujian" />

            </div>


            <span className="candidate-badge px-3 py-1.5 text-[10px] font-medium tracking-wide text-slate-400">
              CANDIDATE
            </span>

          </div>

        </header>

      </div>


      {/* ================================= */}
      {/* CONTENT */}
      {/* ================================= */}

      <div className="mx-auto max-w-5xl px-6 py-10">

        {/* ================================= */}
        {/* EXAM HERO */}
        {/* ================================= */}

        <section className="relative overflow-hidden rounded-[28px] border border-white/[0.07] bg-white/[0.025] px-6 py-8 backdrop-blur-xl sm:px-8">

          <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-violet-500/[0.08] blur-3xl" />


          <div className="relative">

            <div className="flex flex-wrap items-center gap-2">

              <span className="font-mono text-xs tracking-wider text-blue-300/75">
                {
                  candidate?.candidate_code
                }
              </span>


              {(effectiveSections.length > 1 || effectiveModuleCode) && (

                <span className="candidate-badge px-2.5 py-1 text-[10px] text-slate-400">
                  {effectiveSections.length > 1 ? `${effectiveSections.length} SESI MODUL` : effectiveModuleCode}
                </span>

              )}

            </div>


            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {exam.title}
            </h1>


            <p className="mt-3 text-sm text-slate-400 sm:text-base">
              {effectiveSections.map((item) => item.moduleName).join(" → ")}
            </p>

          </div>

        </section>


        {/* ================================= */}
        {/* EXAM PREPARATION CARD */}
        {/* ================================= */}

        <section className="candidate-card mt-6 p-6 sm:p-8">

          <div className="relative z-10">

            {/* HEADER */}

            <div>

              <p className="text-xs uppercase tracking-[0.18em] text-blue-300/70">
                Exam Preparation
              </p>


              <h2 className="mt-2 text-xl font-semibold text-white">
                Persiapan Ujian
              </h2>


              <p className="mt-2 text-sm leading-6 text-slate-500">
                Periksa informasi ujian sebelum memulai sesi.
              </p>

            </div>


            {/* ================================= */}
            {/* INFORMATION CARDS */}
            {/* ================================= */}

            <div className="mt-6 grid gap-3 md:grid-cols-3">

              {/* PESERTA */}

              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.025] p-5">

                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-400/[0.07] text-blue-300">
                  <AppIcon name="participants" className="h-[18px] w-[18px]" />
                </div>


                <p className="mt-4 text-xs text-slate-500">
                  Peserta
                </p>


                <p className="mt-1 truncate font-medium text-slate-200">
                  {
                    candidate?.display_name
                  }
                </p>

              </div>


              {/* JUMLAH SOAL */}

              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.025] p-5">

                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-400/15 bg-violet-400/[0.07] text-violet-300">
                  <AppIcon name="questions" className="h-[18px] w-[18px]" />
                </div>


                <p className="mt-4 text-xs text-slate-500">
                  Jumlah Soal
                </p>


                <p className="mt-1 font-medium text-slate-200">
                  {
                    totalQuestionCount
                  }{" "}
                  soal
                </p>

              </div>


              {/* DURASI */}

              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.025] p-5">

                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300">
                  <AppIcon name="clock" className="h-[18px] w-[18px]" />
                </div>


                <p className="mt-4 text-xs text-slate-500">
                  Durasi
                </p>


                <p className="mt-1 font-medium text-slate-200">
                  {totalDuration} menit
                </p>


                {extraTime > 0 && (

                  <p className="mt-1 text-[10px] text-emerald-400">
                    +{extraTime} menit tambahan
                  </p>

                )}

              </div>

            </div>

            {effectiveSections.length > 1 ? (
              <div className="mt-4 rounded-[20px] border border-cyan-400/12 bg-cyan-400/[0.03] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-cyan-300/65">Struktur Ujian</p>
                    <p className="mt-1 text-sm font-semibold text-white">{effectiveSections.length} sesi modul · timer total {totalDuration} menit</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {effectiveSections.map((item, index) => (
                    <div key={item.id} className="rounded-[15px] border border-white/[0.06] bg-white/[0.025] px-4 py-3">
                      <p className="text-[10px] text-slate-600">SESI {index + 1}</p>
                      <p className="mt-1 text-sm font-medium text-slate-200">{item.moduleName}</p>
                      <p className="mt-1 text-[11px] text-slate-500">Batas sesi {item.duration_minutes} menit</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] leading-5 text-amber-200/75">Di antara sesi Anda boleh memastikan kesiapan sebelum lanjut, tetapi timer total ujian tetap berjalan.</p>
              </div>
            ) : null}

            <div className="mt-4 rounded-[18px] border border-cyan-400/10 bg-cyan-400/[0.025] p-4">
              <p className="text-xs font-semibold text-cyan-100">Jalur modul Anda</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">Modul yang tampil di sini mengikuti assignment Anda pada ujian ini. Jika Anda perlu remedial setelah ujian ditutup, penyelenggara akan memberikan link ujian remedial baru.</p>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] border border-cyan-400/10 bg-cyan-400/[0.025] p-4">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-600">Mulai Ujian</p>
                <p className="mt-1.5 text-sm font-medium text-slate-200">{formatWib(exam.starts_at)} WIB</p>
              </div>
              <div className="rounded-[18px] border border-rose-400/10 bg-rose-400/[0.02] p-4">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-600">Hard Close</p>
                <p className="mt-1.5 text-sm font-medium text-slate-200">{formatWib(exam.hard_close_at)} WIB</p>
              </div>
            </div>


            {/* ================================= */}
            {/* WARNING */}
            {/* ================================= */}

            <div className="mt-6 overflow-hidden rounded-[20px] border border-amber-400/15 bg-amber-400/[0.045]">

              <div className="p-5">

                <div className="flex items-start gap-4">

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/[0.08] text-sm font-bold text-amber-300">
                    !
                  </div>


                  <div>

                    <p className="font-medium text-amber-200">
                      Sebelum memulai
                    </p>


                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Timer dimulai saat tombol{" "}
                      <span className="font-medium text-slate-200">
                        Mulai / Lanjutkan Ujian
                      </span>{" "}
                      ditekan. Setelah sesi dimulai,
                      waktu tetap berjalan meskipun
                      halaman ditutup atau dimuat ulang.
                    </p>

                  </div>

                </div>

              </div>

            </div>

            {policy.security.enableProctoring && (
              <div className="mt-4 rounded-[20px] border border-cyan-400/12 bg-cyan-400/[0.035] p-5">
                <p className="text-sm font-medium text-cyan-100">Aturan pengawasan sesi</p>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                  {policy.security.detectTabSwitch ? <li>• Pindah tab / aplikasi akan dicatat.</li> : null}
                  {policy.security.requireFullscreen ? <li>• Sesi wajib menggunakan fullscreen selama perangkat mendukungnya.</li> : null}
                  {policy.security.detectPrintScreen ? <li>• Tombol PrintScreen dideteksi best-effort dan dapat dihitung sebagai pelanggaran.</li> : null}
                  {policy.security.preventCopyPaste ? <li>• Copy, cut, dan paste diblokir selama ujian.</li> : null}
                  {policy.security.detectDuplicateTab ? <li>• Membuka ujian yang sama di tab lain akan dicatat.</li> : null}
                  {policy.security.enforceSingleDevice ? <li>• Credential dikunci ke satu perangkat aktif; penggunaan bersamaan dari perangkat lain akan ditolak.</li> : null}
                  <li>• Batas pelanggaran: {policy.security.violationLimit}. {policy.security.autoSubmitOnLimit ? "Saat batas tercapai, sesi dapat di-submit otomatis." : "Pelanggaran dicatat untuk pengawas."}</li>
                </ul>
              </div>
            )}

            {policy.instructions.customRules ? (
              <div className="mt-4 rounded-[20px] border border-violet-400/12 bg-violet-400/[0.03] p-5">
                <p className="text-sm font-medium text-violet-100">Aturan tambahan dari penyelenggara</p>
                <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-300">{policy.instructions.customRules}</p>
              </div>
            ) : null}


            {/* ================================= */}
            {/* START */}
            {/* ================================= */}

            {canStartBySubscription ? (
              <form
                action={startThisExam}
                className="mt-6"
              >

                {policy.security.enableProctoring || policy.instructions.customRules ? (
                  <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-4 text-left">
                    <input type="checkbox" name="policy_acknowledged" required className="mt-0.5 h-4 w-4 accent-cyan-400" />
                    <span className="text-xs leading-5 text-slate-400">
                      {policy.security.enableProctoring
                        ? "Saya memahami aturan ujian dan setuju aktivitas sesi yang tertera di atas dicatat untuk keperluan pengawasan."
                        : "Saya sudah membaca dan memahami aturan ujian yang ditetapkan penyelenggara."}
                    </span>
                  </label>
                ) : null}

                <StartAvailabilityButton
                  startsAt={String(exam.starts_at)}
                  hardCloseAt={String(exam.hard_close_at)}
                />

              </form>
            ) : (
              <div className="mt-6 rounded-[18px] border border-amber-400/15 bg-amber-400/[0.045] px-5 py-4 text-center">
                <p className="text-sm font-semibold text-amber-100">Sesi baru sementara tidak tersedia</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">Hubungi penyelenggara ujian. Jika Anda sudah memiliki sesi aktif, buka kembali link/credential yang sama untuk melanjutkan.</p>
              </div>
            )}


            <p className="mt-4 text-center text-[11px] leading-5 text-slate-600">
              Pastikan koneksi internet stabil dan perangkat siap digunakan
              selama ujian.
            </p>

          </div>

        </section>

      </div>

          <PoweredBy show={branding.showPoweredBy} />
</main>
  );
}
