import { createAdminClient } from "@/lib/supabase/admin";

import JoinExamForm from "./JoinExamForm";
import CandidateThemeToggle from "@/app/candidate/ui/CandidateThemeToggle";
import CandidateBrand from "@/app/candidate/ui/CandidateBrand";
import PoweredBy from "@/app/candidate/ui/PoweredBy";
import { getOrganizationBranding } from "@/lib/organization-branding";
import AppIcon from "@/app/ui/AppIcon";


export const dynamic =
  "force-dynamic";


type PageProps = {
  params: Promise<{
    id: string;
  }>;
};


// =====================================
// FORMAT WIB
// =====================================

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


// =====================================
// PAGE
// =====================================

export default async function JoinExamPage({
  params,
}: PageProps) {
  const {
    id: examId,
  } =
    await params;


  const supabase =
    createAdminClient();


  // =====================================
  // LOAD EXAM
  // =====================================

  const {
    data: exam,
    error: examError,
  } =
    await supabase
      .from("exams")
      .select(
        `
        id,
        organization_id,
        title,
        status,
        login_open_at,
        starts_at,
        hard_close_at,
        duration_minutes
        `
      )
      .eq(
        "id",
        examId
      )
      .maybeSingle();


  if (examError) {
    console.error(
      "JOIN PAGE EXAM ERROR:",
      examError
    );
  }


  // =====================================
  // INVALID LINK
  // =====================================

  if (
    examError ||
    !exam
  ) {
    return (
      <main className="candidate-surface relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">

        <div className="fixed right-4 top-4 z-[80]"><CandidateThemeToggle /></div>

        <BackgroundGlow />


        <div className="candidate-enter relative z-10 w-full max-w-lg">

          <div className="candidate-card p-7 text-center sm:p-8">

            <div className="relative z-10">

              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] border border-rose-400/15 bg-rose-400/[0.06] text-lg font-bold text-rose-300">
                !
              </div>


              <p className="mt-5 text-xs uppercase tracking-[0.18em] text-rose-300/60">
                Invalid Exam Link
              </p>


              <h1 className="mt-3 text-2xl font-bold text-white">
                Ujian tidak ditemukan
              </h1>


              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">
                Link ujian tidak valid atau ujian
                sudah tidak tersedia.
              </p>


              <p className="mt-6 text-[11px] leading-5 text-slate-600">
                Periksa kembali link yang diberikan
                oleh penyelenggara.
              </p>

            </div>

          </div>

        </div>

      </main>
    );
  }


  // =====================================
  // LOAD ORGANIZATION
  // =====================================

  const {
    data: organization,
    error: organizationError,
  } =
    await supabase
      .from("organizations")
      .select(
        "id, code, name, active"
      )
      .eq(
        "id",
        exam.organization_id
      )
      .maybeSingle();


  if (organizationError) {
    console.error(
      "JOIN PAGE ORGANIZATION ERROR:",
      organizationError
    );
  }

  const branding = organization
    ? await getOrganizationBranding(String(organization.id), String(organization.name))
    : { organizationId: "", displayName: "VECTR Exam Platform", logoUrl: null, showPoweredBy: false };


  // =====================================
  // STATUS
  // =====================================

  const now =
    Date.now();


  const loginOpenMs =
    exam.login_open_at
      ? new Date(
          exam.login_open_at
        ).getTime()
      : null;


  const hardCloseMs =
    exam.hard_close_at
      ? new Date(
          exam.hard_close_at
        ).getTime()
      : null;


  const validSchedule =
    loginOpenMs !== null &&
    hardCloseMs !== null &&
    !Number.isNaN(
      loginOpenMs
    ) &&
    !Number.isNaN(
      hardCloseMs
    );


  const organizationActive =
    organization?.active !==
    false;


  const examActive =
    exam.status ===
    "ACTIVE";

  const examResumeOnly =
    exam.status ===
    "CLOSED";


  const loginNotOpened =
    validSchedule &&
    now <
      loginOpenMs;


  const loginClosed =
    validSchedule &&
    now >=
      hardCloseMs;


  const canLogin =
    Boolean(
      organization &&
      organizationActive &&
      (examActive || examResumeOnly) &&
      validSchedule &&
      !loginNotOpened &&
      !loginClosed
    );


  // =====================================
  // STATUS MESSAGE
  // =====================================

  let statusTitle =
    "Login tersedia";


  let statusDescription =
    "Masukkan kode peserta dan kode akses untuk masuk ke ujian.";


  let statusType:
    | "success"
    | "warning"
    | "error" =
    "success";


  if (!organization) {
    statusTitle =
      "Organisasi tidak tersedia";

    statusDescription =
      "Data penyelenggara ujian tidak dapat ditemukan.";

    statusType =
      "error";
  } else if (
    !organizationActive
  ) {
    statusTitle =
      "Organisasi tidak aktif";

    statusDescription =
      "Akses ujian dari organisasi ini sedang tidak tersedia.";

    statusType =
      "error";
  } else if (
    !examActive && !examResumeOnly
  ) {
    statusTitle =
      "Ujian belum aktif";

    statusDescription =
      "Ujian ini belum dibuka oleh penyelenggara.";

    statusType =
      "warning";
  } else if (
    !validSchedule
  ) {
    statusTitle =
      "Jadwal belum tersedia";

    statusDescription =
      "Jadwal ujian belum lengkap. Hubungi penyelenggara.";

    statusType =
      "warning";
  } else if (
    loginNotOpened
  ) {
    statusTitle =
      "Login belum dibuka";

    statusDescription =
      `Login peserta akan dibuka pada ${formatWib(
        exam.login_open_at
      )} WIB.`;

    statusType =
      "warning";
  } else if (
    loginClosed
  ) {
    statusTitle =
      "Login sudah ditutup";

    statusDescription =
      `Batas akses ujian berakhir pada ${formatWib(
        exam.hard_close_at
      )} WIB.`;

    statusType =
      "error";
  } else if (examResumeOnly) {
    statusTitle =
      "Login baru ditutup — resume tetap tersedia";

    statusDescription =
      "Form ini hanya menerima peserta yang sudah memiliki sesi ACTIVE. Peserta yang belum memulai tidak dapat membuat sesi baru.";

    statusType =
      "warning";
  }


  // =====================================
  // UI
  // =====================================

  return (
    <main className="candidate-surface relative min-h-screen overflow-hidden px-6 py-10 sm:py-14">

      <div className="fixed right-4 top-4 z-[80]"><CandidateThemeToggle /></div>

      <BackgroundGlow />


      <div className="candidate-enter relative z-10 mx-auto w-full max-w-3xl">

        {/* ================================= */}
        {/* BRAND */}
        {/* ================================= */}

        <div className="mb-6 flex justify-center text-center">
          <CandidateBrand displayName={branding.displayName} logoUrl={branding.logoUrl} subtitle="Participant Access" size="lg" />
        </div>

        {/* ================================= */}
        {/* EXAM HEADER */}
        {/* ================================= */}

        <section className="candidate-card overflow-hidden p-6 sm:p-8">

          <div className="relative z-10">

            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">

              <div className="min-w-0">

                <div className="flex flex-wrap items-center gap-2">

                  {organization && (

                    <span className="candidate-badge px-3 py-1.5 text-[10px] font-medium text-slate-300">
                      {organization.name}
                    </span>

                  )}


                  <span
                    className={
                      examActive
                        ? "candidate-badge candidate-badge-success px-3 py-1.5 text-[11px] font-semibold"
                        : examResumeOnly
                          ? "candidate-badge px-3 py-1.5 text-[11px] font-semibold text-amber-200"
                          : "candidate-badge px-3 py-1.5 text-[11px] font-semibold text-slate-400"
                    }
                  >
                    {examResumeOnly ? "RESUME ONLY" : exam.status}
                  </span>

                </div>


                <h1 className="mt-5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {exam.title}
                </h1>


                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Halaman akses peserta untuk ujian
                  yang telah ditentukan oleh penyelenggara.
                </p>

              </div>


              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06] text-cyan-300">
                <AppIcon name="exams" className="h-6 w-6" />
              </div>

            </div>


            {/* ================================= */}
            {/* EXAM INFO */}
            {/* ================================= */}

            <div className="candidate-divider my-6" />


            <div className="grid gap-3 sm:grid-cols-2">

              <InfoCard
                label="Login Dibuka"
                value={
                  `${formatWib(
                    exam.login_open_at
                  )} WIB`
                }
              />


              <InfoCard
                label="Ujian Mulai"
                value={
                  `${formatWib(
                    exam.starts_at
                  )} WIB`
                }
              />


              <InfoCard
                label="Hard Close"
                value={
                  `${formatWib(
                    exam.hard_close_at
                  )} WIB`
                }
              />


              <InfoCard
                label="Durasi"
                value={
                  `${exam.duration_minutes} menit`
                }
              />

            </div>


            {/* ================================= */}
            {/* STATUS */}
            {/* ================================= */}

            <div
              className={
                statusType ===
                "success"
                  ? "mt-5 rounded-[20px] border border-emerald-400/15 bg-emerald-400/[0.045] p-4"
                  : statusType ===
                    "warning"
                  ? "mt-5 rounded-[20px] border border-amber-400/15 bg-amber-400/[0.045] p-4"
                  : "mt-5 rounded-[20px] border border-rose-400/15 bg-rose-400/[0.045] p-4"
              }
            >

              <div className="flex items-start gap-3">

                <span
                  className={
                    statusType ===
                    "success"
                      ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]"
                      : statusType ===
                        "warning"
                      ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400"
                      : "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-400"
                  }
                />


                <div>

                  <p
                    className={
                      statusType ===
                      "success"
                        ? "text-sm font-medium text-emerald-200"
                        : statusType ===
                          "warning"
                        ? "text-sm font-medium text-amber-200"
                        : "text-sm font-medium text-rose-200"
                    }
                  >
                    {statusTitle}
                  </p>


                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {statusDescription}
                  </p>

                </div>

              </div>

            </div>


            {/* ================================= */}
            {/* LOGIN FORM */}
            {/* ================================= */}

            {canLogin ? (

              <JoinExamForm
                examId={
                  exam.id
                }
              />

            ) : (

              <div className="mt-6 rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-5 text-center">

                <p className="text-sm text-slate-400">
                  Form akses belum tersedia.
                </p>


                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Periksa status dan jadwal ujian di atas, lalu gunakan kembali link ini saat akses tersedia.
                </p>

              </div>

            )}

          </div>

        </section>


        {/* ================================= */}
        {/* FOOTER */}
        {/* ================================= */}

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.18em] text-slate-700">Secure Participant Access</p>
        <PoweredBy show={branding.showPoweredBy} />

      </div>

    </main>
  );
}


// =====================================
// INFO CARD
// =====================================

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/[0.055] bg-white/[0.025] p-4">

      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-600">
        {label}
      </p>


      <p className="mt-2 text-xs leading-5 text-slate-300">
        {value}
      </p>

    </div>
  );
}


// =====================================
// BACKGROUND
// =====================================

function BackgroundGlow() {
  return (
    <div className="pointer-events-none fixed inset-0">

      <div className="absolute -left-32 top-1/4 h-80 w-80 rounded-full bg-blue-500/[0.09] blur-[110px]" />

      <div className="absolute -right-32 bottom-1/4 h-80 w-80 rounded-full bg-violet-500/[0.08] blur-[110px]" />

      <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/[0.04] blur-[110px]" />

    </div>
  );
}