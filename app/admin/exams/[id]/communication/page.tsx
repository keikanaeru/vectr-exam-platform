import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminReadAccess } from "@/lib/organization-subscription";
import FlashNotice from "@/app/ui/FlashNotice";
import { isProductionEmailReady } from "@/lib/resend";

import {
  saveEmailCampaign,
} from "./actions";

import SendModeFields from "./SendModeFields";


export const dynamic =
  "force-dynamic";


type PageProps = {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};


type CandidateRow = {
  id: string;
  candidate_code: string;
  display_name: string;
  email: string | null;
};


type CampaignRow = {
  id: string;
  name: string;
  subject_template: string;
  send_mode: string;
  scheduled_at: string | null;
  status: string;
  created_at: string;
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

export default async function ExamCommunicationPage({
  params,
  searchParams,
}: PageProps) {
  const {
    id: examId,
  } =
    await params;


  const resolvedSearchParams =
    await searchParams;


  const errorMessage =
    typeof resolvedSearchParams.error ===
    "string"
      ? resolvedSearchParams.error
      : "";


  const successMessage =
    typeof resolvedSearchParams.success ===
    "string"
      ? resolvedSearchParams.success
      : "";


  // =====================================
  // ORGANIZATION
  // =====================================

  const {
    organizationId,
    organization,
  } =
    await requireAdminReadAccess();


  const supabase =
    createAdminClient();


  // =====================================
  // EXAM
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
        module_id,
        batch_id,
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
      .eq(
        "organization_id",
        organizationId
      )
      .maybeSingle();


  if (examError) {
    console.error(
      "COMMUNICATION EXAM ERROR:",
      examError
    );

    throw new Error(
      "Gagal membaca data ujian."
    );
  }


  if (!exam) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-10">

        <div className="r9-surface p-8 text-center">

          <div className="relative z-10">

            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/15 bg-rose-400/[0.06] text-lg font-bold text-rose-300">
              !
            </div>


            <h1 className="mt-5 text-2xl font-bold text-slate-100">
              Ujian tidak ditemukan
            </h1>


            <p className="mt-2 text-sm text-slate-500">
              Ujian tidak tersedia pada organisasi aktif.
            </p>


            <Link
              href="/admin/exams"
              className="r9-button r9-button--secondary mt-6"
            >
              Kembali ke Ujian
            </Link>

          </div>

        </div>

      </main>
    );
  }


  // =====================================
  // ASSIGNMENTS
  // =====================================

  const {
    data: assignmentRows,
    error: assignmentsError,
  } =
    await supabase
      .from(
        "exam_assignments"
      )
      .select(
        "candidate_id, access_code_ciphertext"
      )
      .eq(
        "exam_id",
        exam.id
      )
      .eq(
        "active",
        true
      );


  if (assignmentsError) {
    console.error(
      "COMMUNICATION ASSIGNMENTS ERROR:",
      assignmentsError
    );

    throw new Error(
      "Gagal membaca peserta ujian."
    );
  }


  const candidateIds =
    [
      ...new Set(
        (
          assignmentRows ??
          []
        ).map(
          (
            assignment
          ) =>
            String(
              assignment.candidate_id
            )
        )
      ),
    ];


  const assignmentCredentialMap = new Map(
    (assignmentRows ?? []).map((row) => [String(row.candidate_id), Boolean(row.access_code_ciphertext)])
  );


  // =====================================
  // CANDIDATES
  // =====================================

  let candidates:
    CandidateRow[] = [];


  if (
    candidateIds.length >
    0
  ) {
    const {
      data: candidateRows,
      error: candidatesError,
    } =
      await supabase
        .from("candidates")
        .select(
          `
          id,
          candidate_code,
          display_name,
          email
          `
        )
        .eq(
          "organization_id",
          organizationId
        )
        .eq(
          "active",
          true
        )
        .in(
          "id",
          candidateIds
        )
        .order(
          "display_name"
        );


    if (candidatesError) {
      console.error(
        "COMMUNICATION CANDIDATES ERROR:",
        candidatesError
      );

      throw new Error(
        "Gagal membaca email peserta."
      );
    }


    candidates =
      (
        candidateRows ??
        []
      ).map(
        (
          candidate
        ) => ({
          id:
            String(
              candidate.id
            ),

          candidate_code:
            String(
              candidate.candidate_code
            ),

          display_name:
            String(
              candidate.display_name
            ),

          email:
            candidate.email
              ? String(
                  candidate.email
                )
              : null,
        })
      );
  }


  // =====================================
  // CAMPAIGNS
  // =====================================

  const {
    data: campaignRows,
    error: campaignError,
  } =
    await supabase
      .from(
        "exam_email_campaigns"
      )
      .select(
        `
        id,
        name,
        subject_template,
        send_mode,
        scheduled_at,
        status,
        created_at
        `
      )
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "exam_id",
        exam.id
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );


  if (campaignError) {
    console.error(
      "COMMUNICATION CAMPAIGNS ERROR:",
      campaignError
    );

    throw new Error(
      "Gagal membaca campaign email."
    );
  }


  const campaigns:
    CampaignRow[] =
    (
      campaignRows ??
      []
    ).map(
      (
        campaign
      ) => ({
        id:
          String(
            campaign.id
          ),

        name:
          String(
            campaign.name
          ),

        subject_template:
          String(
            campaign.subject_template
          ),

        send_mode:
          String(
            campaign.send_mode
          ),

        scheduled_at:
          campaign.scheduled_at
            ? String(
                campaign.scheduled_at
              )
            : null,

        status:
          String(
            campaign.status
          ),

        created_at:
          String(
            campaign.created_at
          ),
      })
    );


  // =====================================
  // RECIPIENT SUMMARY
  // =====================================

  const candidatesWithEmail =
    candidates.filter(
      (
        candidate
      ) =>
        Boolean(
          candidate.email?.trim()
        )
    );


  const candidatesWithoutEmail =
    candidates.filter(
      (
        candidate
      ) =>
        !candidate.email?.trim()
    );


  const recipientCount =
    candidatesWithEmail.length;


  const credentialReadyCount = candidatesWithEmail.filter((candidate) =>
    assignmentCredentialMap.get(String(candidate.id))
  ).length;


  const emailSenderReady = isProductionEmailReady();


  // =====================================
  // DEFAULT TEMPLATE
  // =====================================

  const defaultSubject =
    "Credential & Informasi {{nama_ujian}}";


  const defaultBody =
`Halo {{nama_peserta}},

Anda terdaftar sebagai peserta pada:

{{nama_ujian}}

Kode Peserta:
{{kode_peserta}}

Kode Akses Pribadi:
{{kode_akses}}

Login Dibuka:
{{waktu_login}}

Jadwal Ujian:
{{tanggal_ujian}}

Hard Close:
{{hard_close}}

Durasi Total:
{{durasi_ujian}}

Link Akses:
{{link_ujian}}

Simpan kode akses ini dan jangan membagikannya kepada orang lain.

${organization.name}`;



  const saveThisExam =
    saveEmailCampaign.bind(
      null,
      exam.id
    );


  // =====================================
  // UI
  // =====================================

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-8">

      {/* ================================= */}
      {/* BACK */}
      {/* ================================= */}

      <Link
        href="/admin/exams"
        className="inline-flex items-center gap-2 text-xs text-slate-500 transition hover:text-slate-300"
      >
        <span>
          ←
        </span>

        <span>
          Kembali ke Ujian
        </span>
      </Link>


      {/* ================================= */}
      {/* HERO */}
      {/* ================================= */}

      <section className="mt-5">
        <div className="r9-surface px-6 py-8 sm:px-8">


          <div className="relative">

            <div className="flex flex-wrap items-center gap-2">

              <span className="r9-badge">
                {organization.name}
              </span>


              <span
                className={
                  exam.status ===
                  "ACTIVE"
                    ? "r9-badge r9-badge--success"
                    : "r9-badge"
                }
              >
                {exam.status}
              </span>

            </div>


            <p className="r9-kicker text-xs font-semibold">
              Pusat Komunikasi
            </p>


            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-100">
              Email Peserta
            </h1>


            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">

              Buat pesan untuk peserta yang
              terdaftar pada ujian{" "}

              <span className="font-medium text-slate-200">
                {exam.title}
              </span>
              .

            </p>

          </div>

        </div>

      </section>


      {errorMessage ? <FlashNotice tone="error" message={errorMessage} /> : null}
      {successMessage ? <FlashNotice tone="success" message={successMessage} /> : null}

      {/* ================================= */}
      {/* SUMMARY */}
      {/* ================================= */}

      <section className="admin-summary-strip admin-communication-summary mt-5 grid gap-0 sm:grid-cols-2 xl:grid-cols-4">

        <SummaryCard
          label="Peserta Ujian"
          value={
            candidates.length
          }
        />


        <SummaryCard
          label="Email Siap"
          value={
            recipientCount
          }
          valueClassName="text-emerald-300"
        />


        <SummaryCard
          label="Tanpa Email"
          value={
            candidatesWithoutEmail.length
          }
          valueClassName={
            candidatesWithoutEmail.length
              ? "text-amber-300"
              : "text-slate-300"
          }
        />


        <SummaryCard
          label="Kampanye"
          value={
            campaigns.length
          }
          valueClassName="text-cyan-300"
        />

      </section>


      {/* ================================= */}
      {/* EXAM INFO */}
      {/* ================================= */}

      <section className="r9-surface mt-5 p-5">

        <div className="relative z-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <ExamInfo
            label="Ujian"
            value={
              exam.title
            }
          />


          <ExamInfo
            label="Mulai"
            value={
              `${formatWib(
                exam.starts_at
              )} WIB`
            }
          />


          <ExamInfo
            label="Hard Close"
            value={
              `${formatWib(
                exam.hard_close_at
              )} WIB`
            }
          />


          <ExamInfo
            label="Durasi"
            value={
              `${exam.duration_minutes} menit`
            }
          />

        </div>

      </section>


      <section className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className={`r9-surface p-4 ${emailSenderReady ? "border-emerald-400/30" : "border-amber-400/30"}`}>
          <p className="r9-kicker">Pengirim Email</p>
          <p className={`mt-2 text-sm font-semibold ${emailSenderReady ? "text-emerald-200" : "text-amber-200"}`}>
            {emailSenderReady ? "SIAP PRODUKSI" : "BELUM SIAP PRODUKSI"}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            {emailSenderReady ? "RESEND_API_KEY dan sender domain tersedia." : "Lengkapi RESEND_API_KEY + RESEND_FROM_EMAIL sebelum mengirim ke peserta sungguhan."}
          </p>
        </div>
        <div className="r9-surface p-4">
          <p className="r9-kicker">Credential Email</p>
          <p className={`mt-2 text-sm font-semibold ${credentialReadyCount === recipientCount && recipientCount > 0 ? "text-emerald-200" : "text-amber-200"}`}>
            {credentialReadyCount}/{recipientCount} READY
          </p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">Kode akses tetap terenkripsi di database dan baru didekripsi sesaat sebelum request ke Resend.</p>
        </div>
      </section>


      {/* ================================= */}
      {/* CONTENT */}
      {/* ================================= */}

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_390px]">

        {/* ================================= */}
        {/* MESSAGE BUILDER */}
        {/* ================================= */}

        <form
          action={
            saveThisExam
          }
          className="r9-surface p-6"
        >

          <div className="relative z-10">

            <p className="r9-kicker">
              Penyusun Pesan
            </p>


            <h2 className="mt-2 text-xl font-semibold text-slate-100">
              Buat Kampanye
            </h2>


            <p className="mt-2 text-xs leading-5 text-slate-500">
              Tentukan isi pesan dan kapan email
              akan dikirim.
            </p>


            {/* ================================= */}
            {/* CAMPAIGN NAME */}
            {/* ================================= */}

            <label className="r9-field-label mt-6">
              Nama Kampanye
            </label>


            <input
              name="name"
              required
              placeholder="Undangan Ujian H-1"
              className="r9-input mt-2"
            />


            <p className="mt-1.5 text-[11px] text-slate-600">
              Nama ini hanya terlihat oleh admin.
            </p>


            {/* ================================= */}
            {/* SUBJECT */}
            {/* ================================= */}

            <label className="r9-field-label mt-5">
              Subject Email
            </label>


            <input
              name="subject_template"
              required
              defaultValue={
                defaultSubject
              }
              className="r9-input mt-2"
            />


            {/* ================================= */}
            {/* BODY */}
            {/* ================================= */}

            <label className="r9-field-label mt-5">
              Isi Pesan
            </label>


            <textarea
              name="body_template"
              required
              defaultValue={
                defaultBody
              }
              rows={18}
              className="r9-input mt-2 min-h-[420px] resize-y font-mono text-xs leading-6"
            />


            {/* ================================= */}
            {/* SEND MODE */}
            {/* ================================= */}

            <SendModeFields />


            {/* ================================= */}
            {/* SUBMIT */}
            {/* ================================= */}

            <button
              type="submit"
              disabled={
                recipientCount ===
                0
              }
              className="r9-button r9-button--primary mt-6 w-full disabled:opacity-40"
            >
              Simpan Kampanye
            </button>


            {recipientCount ===
              0 && (

              <p className="mt-3 text-center text-xs text-amber-300/70">
                Kampanye belum dapat dibuat karena
                tidak ada peserta dengan email.
              </p>

            )}

          </div>

        </form>


        {/* ================================= */}
        {/* RIGHT SIDEBAR */}
        {/* ================================= */}

        <div className="space-y-5">

          {/* ================================= */}
          {/* VARIABLES */}
          {/* ================================= */}

          <div className="r9-surface p-5">

            <div className="relative z-10">

              <p className="r9-kicker">
                Variabel Template
              </p>


              <h3 className="mt-2 font-semibold text-slate-100">
                Variabel Pesan
              </h3>


              <p className="mt-2 text-xs leading-5 text-slate-500">
                Nilai ini berubah otomatis
                untuk setiap peserta.
              </p>


              <div className="mt-4 space-y-2">

                <Variable
                  code="{{nama_peserta}}"
                  label="Nama peserta"
                />


                <Variable
                  code="{{kode_peserta}}"
                  label="Kode peserta"
                />


                <Variable
                  code="{{nama_ujian}}"
                  label="Nama ujian"
                />


                <Variable
                  code="{{tanggal_ujian}}"
                  label="Jadwal ujian"
                />


                <Variable
                  code="{{durasi_ujian}}"
                  label="Durasi"
                />


                <Variable
                  code="{{link_ujian}}"
                  label="Link peserta"
                />

                <Variable code="{{kode_akses}}" label="Kode akses pribadi (ditampilkan saat kirim)" />
                <Variable code="{{waktu_login}}" label="Waktu login dibuka" />
                <Variable code="{{hard_close}}" label="Hard Close" />
                <Variable code="{{nama_organisasi}}" label="Nama organisasi" />

              </div>


              <div className="mt-4 rounded-[16px] border border-cyan-400/10 bg-cyan-400/[0.035] p-3">

                <p className="text-[11px] leading-5 text-slate-500">
                  {"{{kode_akses}}"} aman dipakai. Plaintext tidak disimpan di delivery queue; kode didekripsi in-memory tepat sebelum email dikirim atau dijadwalkan.
                </p>

              </div>

            </div>

          </div>


          {/* ================================= */}
          {/* RECIPIENTS */}
          {/* ================================= */}

          <div className="r9-surface p-5">

            <div className="relative z-10">

              <p className="text-xs uppercase tracking-[0.16em] text-emerald-300/60">
                Penerima
              </p>


              <h3 className="mt-2 font-semibold text-slate-100">
                Penerima Email
              </h3>


              <div className="mt-4 space-y-3">

                {candidatesWithEmail.length ? (

                  candidatesWithEmail
                    .slice(
                      0,
                      8
                    )
                    .map(
                      (
                        candidate
                      ) => (

                        <div
                          key={
                            candidate.id
                          }
                          className="rounded-[16px] border border-white/[0.05] bg-white/[0.02] p-3"
                        >

                          <div className="flex items-center justify-between gap-3">

                            <div className="min-w-0">

                              <p className="truncate text-xs font-medium text-slate-300">
                                {
                                  candidate.display_name
                                }
                              </p>


                              <p className="mt-1 truncate text-[11px] text-slate-600">
                                {
                                  candidate.email
                                }
                              </p>

                            </div>


                            <span className="shrink-0 font-mono text-[11px] text-cyan-300/60">
                              {
                                candidate.candidate_code
                              }
                            </span>

                          </div>

                        </div>

                      )
                    )

                ) : (

                  <div className="rounded-[16px] border border-dashed border-white/[0.07] p-5 text-center">

                    <p className="text-xs text-slate-600">
                      Belum ada peserta dengan email.
                    </p>

                  </div>

                )}


                {recipientCount >
                  8 && (

                  <p className="pt-1 text-center text-[11px] text-slate-600">
                    +{" "}
                    {
                      recipientCount -
                      8
                    }{" "}
                    peserta lainnya
                  </p>

                )}

              </div>

            </div>

          </div>

        </div>

      </section>


      {/* ================================= */}
      {/* CAMPAIGN HISTORY */}
      {/* ================================= */}

      <section className="mt-7">

        <div className="mb-4">

          <p className="text-xs uppercase tracking-[0.18em] text-slate-600">
            Riwayat Kampanye
          </p>


          <h2 className="mt-2 text-xl font-semibold text-white">
            Kampanye Tersimpan
          </h2>

        </div>


        {campaigns.length ? (

          <div className="space-y-3">

            {campaigns.map(
              (
                campaign
              ) => (

                <div
                  key={
                    campaign.id
                  }
                  className="r9-surface p-5"
                >

                  <div className="relative z-10">

                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

                      {/* ================================= */}
                      {/* INFO */}
                      {/* ================================= */}

                      <div className="min-w-0">

                        <div className="flex flex-wrap items-center gap-2">

                          <CampaignStatus
                            status={
                              campaign.status
                            }
                          />


                          <span className="text-[11px] text-slate-600">
                            {
                              formatWib(
                                campaign.created_at
                              )
                            }{" "}
                            WIB
                          </span>

                        </div>


                        <h3 className="mt-3 font-medium text-slate-200">
                          {
                            campaign.name
                          }
                        </h3>


                        <p className="mt-1 break-words text-xs text-slate-500">
                          {
                            campaign.subject_template
                          }
                        </p>


                        {campaign.send_mode ===
                          "SCHEDULED" &&
                          campaign.scheduled_at && (

                          <div className="r9-datetime__note mt-3 inline-flex items-center gap-2 px-3 py-2">

                            <span className="r9-datetime__note-signal h-1.5 w-1.5 rounded-full" />


                            <p className="text-[11px] text-cyan-200/80">
                              Dijadwalkan{" "}
                              {
                                formatWib(
                                  campaign.scheduled_at
                                )
                              }{" "}
                              WIB
                            </p>

                          </div>

                        )}

                      </div>


                      {/* ================================= */}
                      {/* ACTION */}
                      {/* ================================= */}

                      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">

                        <div className="rounded-[14px] border border-white/[0.05] bg-white/[0.02] px-4 py-2.5">

                          <p className="text-[11px] uppercase tracking-wider text-slate-600">
                            Mode
                          </p>


                          <p
                            className={
                              campaign.send_mode ===
                              "SCHEDULED"
                                ? "mt-1 text-xs text-cyan-300"
                                : "mt-1 text-xs text-slate-400"
                            }
                          >
                            {
                              campaign.send_mode
                            }
                          </p>

                        </div>


                        <Link
                          href={
                            `/admin/exams/${exam.id}/communication/${campaign.id}`
                          }
                          className="r9-button r9-button--secondary flex items-center justify-center gap-2"
                        >
                          Pratinjau Email

                          <span>
                            →
                          </span>
                        </Link>

                      </div>

                    </div>

                  </div>

                </div>

              )
            )}

          </div>

        ) : (

          <div className="r9-surface p-8 text-center">

            <p className="text-sm text-slate-400">
              Belum ada campaign email.
            </p>


            <p className="mt-2 text-xs text-slate-600">
              Kampanye yang disimpan akan muncul di sini.
            </p>

          </div>

        )}

      </section>

    </main>
  );
}


// =====================================
// SUMMARY CARD
// =====================================

function SummaryCard({
  label,
  value,
  valueClassName =
    "text-white",
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="r9-surface p-4">

      <div className="relative z-10">

        <p className="text-xs text-slate-500">
          {label}
        </p>


        <p
          className={`mt-2 text-2xl font-bold ${valueClassName}`}
        >
          {value}
        </p>

      </div>

    </div>
  );
}


// =====================================
// EXAM INFO
// =====================================

function ExamInfo({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>

      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-600">
        {label}
      </p>


      <p className="mt-2 text-xs leading-5 text-slate-300">
        {value}
      </p>

    </div>
  );
}


// =====================================
// VARIABLE
// =====================================

function Variable({
  code,
  label,
}: {
  code: string;
  label: string;
}) {
  return (
    <div className="rounded-[14px] border border-white/[0.05] bg-black/10 p-3">

      <code className="text-[11px] text-cyan-300">
        {code}
      </code>


      <p className="mt-1 text-[11px] text-slate-600">
        {label}
      </p>

    </div>
  );
}


// =====================================
// CAMPAIGN STATUS
// =====================================

function CampaignStatus({
  status,
}: {
  status: string;
}) {
  if (
    status ===
    "SENT"
  ) {
    return (
      <span className="r9-badge r9-badge--success">
        SENT
      </span>
    );
  }


  if (
    status ===
    "SCHEDULED"
  ) {
    return (
      <span className="r9-badge r9-badge--accent">
        SCHEDULED
      </span>
    );
  }


  if (
    status ===
    "SENDING"
  ) {
    return (
      <span className="r9-badge r9-badge--accent">
        SENDING
      </span>
    );
  }


  if (
    status ===
    "FAILED"
  ) {
    return (
      <span className="r9-badge r9-badge--danger">
        FAILED
      </span>
    );
  }


  if (
    status ===
    "PARTIAL"
  ) {
    return (
      <span className="r9-badge r9-badge--warning">
        PARTIAL
      </span>
    );
  }


  return (
    <span className="r9-badge">
      {status}
    </span>
  );
}
