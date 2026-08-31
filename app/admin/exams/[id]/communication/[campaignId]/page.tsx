import Image from "next/image";
import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminReadAccess } from "@/lib/organization-subscription";
import FlashNotice from "@/app/ui/FlashNotice";
import { getPublicAppOrigin } from "@/lib/platform-email";
import { isProductionEmailReady } from "@/lib/resend";

import {
  cancelScheduledCampaign,
  generateCampaignDeliveries,
  retryFailedDeliveries,
  scheduleCampaign,
  sendCampaignNow,
  sendCampaignTestEmail,
  syncCampaignProviderStatus,
} from "./actions";


export const dynamic =
  "force-dynamic";


type PageProps = {
  params: Promise<{
    id: string;
    campaignId: string;
  }>;

  searchParams: Promise<{
    error?: string;
    success?: string;
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
        "full",

      timeStyle:
        "short",
    }
  ).format(
    new Date(value)
  );
}


// =====================================
// RENDER TEMPLATE
// =====================================

function renderTemplate(
  template: string,
  variables: Record<
    string,
    string
  >
) {
  let result =
    template;


  for (
    const [
      key,
      value,
    ] of Object.entries(
      variables
    )
  ) {
    result =
      result
        .split(
          `{{${key}}}`
        )
        .join(
          value
        );
  }


  return result;
}


// =====================================
// PAGE
// =====================================

export default async function CampaignPreviewPage({
  params,
  searchParams,
}: PageProps) {
  const {
    id: examId,
    campaignId,
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
        batch_id,
        title,
        login_open_at,
        starts_at,
        hard_close_at,
        duration_minutes,
        status
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
      "PREVIEW EXAM ERROR:",
      examError
    );

    throw new Error(
      "Gagal membaca data ujian."
    );
  }


  if (!exam) {
    return (
      <NotFoundCard
        title="Ujian tidak ditemukan"
        description="Ujian tidak tersedia pada organisasi aktif."
        href="/admin/exams"
      />
    );
  }


  // =====================================
  // CAMPAIGN
  // =====================================

  const {
    data: campaign,
    error: campaignError,
  } =
    await supabase
      .from(
        "exam_email_campaigns"
      )
      .select(
        `
        id,
        organization_id,
        exam_id,
        name,
        subject_template,
        body_template,
        send_mode,
        scheduled_at,
        status,
        sent_at,
        settings,
        created_at
        `
      )
      .eq(
        "id",
        campaignId
      )
      .eq(
        "exam_id",
        examId
      )
      .eq(
        "organization_id",
        organizationId
      )
      .maybeSingle();


  if (campaignError) {
    console.error(
      "PREVIEW CAMPAIGN ERROR:",
      campaignError
    );

    throw new Error(
      "Gagal membaca campaign email."
    );
  }


  if (!campaign) {
    return (
      <NotFoundCard
        title="Kampanye tidak ditemukan"
        description="Kampanye email tidak tersedia pada ujian ini."
        href={
          `/admin/exams/${examId}/communication`
        }
      />
    );
  }


  // =====================================
  // ASSIGNMENTS
  // =====================================

  const {
    data: assignments,
    error: assignmentsError,
  } =
    await supabase
      .from(
        "exam_assignments"
      )
      .select(
        "candidate_id"
      )
      .eq(
        "exam_id",
        examId
      )
      .eq(
        "active",
        true
      );


  if (assignmentsError) {
    console.error(
      "PREVIEW ASSIGNMENTS ERROR:",
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
          assignments ??
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


  // =====================================
  // RECIPIENTS
  // =====================================

  let recipients:
    {
      id: string;
      candidate_code: string;
      display_name: string;
      email: string;
    }[] = [];


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
        .eq(
          "batch_id",
          String(exam.batch_id)
        )
        .in(
          "id",
          candidateIds
        )
        .not(
          "email",
          "is",
          null
        )
        .order(
          "display_name"
        );


    if (candidatesError) {
      console.error(
        "PREVIEW CANDIDATES ERROR:",
        candidatesError
      );

      throw new Error(
        "Gagal membaca penerima email."
      );
    }


    recipients =
      (
        candidateRows ??
        []
      )
        .filter(
          (
            candidate
          ) =>
            Boolean(
              candidate.email?.trim()
            )
        )
        .map(
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
              String(
                candidate.email
              ),
          })
        );
  }


  if (
    recipients.length ===
    0
  ) {
    return (
      <NotFoundCard
        title="Tidak ada penerima"
        description="Kampanye ini belum memiliki peserta dengan alamat email."
        href={
          `/admin/exams/${examId}/communication`
        }
      />
    );
  }


  // =====================================
  // DELIVERY QUEUE
  // =====================================

  const {
    data: deliveryRows,
    error: deliveryError,
  } =
    await supabase
      .from(
        "exam_email_deliveries"
      )
      .select(
        `
        id,
        candidate_id,
        recipient_name,
        recipient_email,
        status,
        attempt_count,
        provider_message_id,
        last_error,
        sent_at,
        failed_at
        `
      )
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "exam_id",
        examId
      )
      .eq(
        "campaign_id",
        campaignId
      )
      .order(
        "recipient_name"
      );


  if (deliveryError) {
    console.error(
      "PREVIEW DELIVERY ERROR:",
      deliveryError
    );

    throw new Error(
      "Gagal membaca delivery queue."
    );
  }


  const deliveries =
    deliveryRows ??
    [];


  const deliveryCount =
    deliveries.length;


  const pendingCount =
    deliveries.filter(
      (
        delivery
      ) =>
        delivery.status ===
        "PENDING"
    ).length;


  const processingCount =
    deliveries.filter(
      (
        delivery
      ) =>
        delivery.status ===
        "PROCESSING"
    ).length;


  const scheduledCount =
    deliveries.filter(
      (
        delivery
      ) =>
        delivery.status ===
        "SCHEDULED"
    ).length;


  const sentCount =
    deliveries.filter(
      (
        delivery
      ) =>
        delivery.status ===
        "SENT"
    ).length;


  const failedCount =
    deliveries.filter(
      (
        delivery
      ) =>
        delivery.status ===
        "FAILED"
    ).length;


  const hasDeliveryQueue =
    deliveryCount >
    0;

  const hasProviderHistory = deliveries.some(
    (delivery) => Boolean(delivery.provider_message_id) || ["SENT", "SCHEDULED", "PROCESSING"].includes(String(delivery.status))
  );


  // =====================================
  // SAMPLE RECIPIENT
  // =====================================

  const sampleRecipient =
    recipients[0];


  // =====================================
  // PARTICIPANT LINK
  // =====================================

  const origin = await getPublicAppOrigin();
  const participantLink = `${origin}/join/${exam.id}`;


  // =====================================
  // VARIABLES
  // =====================================

  const emailSenderReady = isProductionEmailReady();


  const variables = {
    nama_peserta: sampleRecipient.display_name,
    kode_peserta: sampleRecipient.candidate_code,
    nama_ujian: exam.title,
    nama_organisasi: organization.name,
    tanggal_ujian: `${formatWib(exam.starts_at)} WIB`,
    waktu_login: `${formatWib(exam.login_open_at)} WIB`,
    hard_close: `${formatWib(exam.hard_close_at)} WIB`,
    durasi_ujian: `${exam.duration_minutes} menit`,
    link_ujian: participantLink,
    kode_akses: "••••-••••",
  };


  // =====================================
  // RENDER PREVIEW
  // =====================================

  const renderedSubject =
    renderTemplate(
      campaign.subject_template,
      variables
    );


  const renderedBody =
    renderTemplate(
      campaign.body_template,
      variables
    );


  // =====================================
  // ACTIONS
  // =====================================

  const generateDeliveries =
    generateCampaignDeliveries.bind(
      null,
      exam.id,
      campaign.id
    );


  const sendNow =
    sendCampaignNow.bind(
      null,
      exam.id,
      campaign.id
    );


  const scheduleDelivery =
    scheduleCampaign.bind(
      null,
      exam.id,
      campaign.id
    );


  const sendTest = sendCampaignTestEmail.bind(null, exam.id, campaign.id);
  const retryFailed = retryFailedDeliveries.bind(null, exam.id, campaign.id);
  const cancelScheduled = cancelScheduledCampaign.bind(null, exam.id, campaign.id);
  const syncProvider = syncCampaignProviderStatus.bind(null, exam.id, campaign.id);


  const canGenerateQueue =
    campaign.status ===
      "DRAFT" &&
    !hasProviderHistory;


  const canSendNow =
    emailSenderReady &&
    hasDeliveryQueue &&
    pendingCount > 0 &&
    campaign.status ===
      "DRAFT" &&
    campaign.send_mode ===
      "NOW";


  const canSchedule =
    emailSenderReady &&
    hasDeliveryQueue &&
    pendingCount > 0 &&
    campaign.status ===
      "DRAFT" &&
    campaign.send_mode ===
      "SCHEDULED" &&
    Boolean(
      campaign.scheduled_at
    );


  const campaignScheduled =
    campaign.status ===
    "SCHEDULED";


  const campaignSent =
    campaign.status ===
    "SENT";


  const campaignFailed =
    campaign.status ===
    "FAILED";


  const campaignPartial =
    campaign.status ===
    "PARTIAL";


  const campaignSettings =
    campaign.settings && typeof campaign.settings === "object"
      ? campaign.settings as Record<string, unknown>
      : {};

  const campaignCanceled = Boolean(campaignSettings.canceled_at);
  const canRetryFailed = !campaignCanceled && ["FAILED", "PARTIAL"].includes(String(campaign.status)) && failedCount > 0;
  const canCancelScheduled = !campaignCanceled && ["SCHEDULED", "PARTIAL", "DRAFT"].includes(String(campaign.status)) && scheduledCount > 0;
  const canSyncProvider = deliveries.some((delivery) => Boolean(delivery.provider_message_id));


  // =====================================
  // UI
  // =====================================

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-8">

      {/* ================================= */}
      {/* BACK */}
      {/* ================================= */}

      <Link
        href={
          `/admin/exams/${exam.id}/communication`
        }
        className="inline-flex items-center gap-2 text-xs text-slate-500 transition hover:text-slate-300"
      >
        <span>
          ←
        </span>

        <span>
          Kembali ke Pusat Komunikasi
        </span>
      </Link>


      {/* ================================= */}
      {/* HERO */}
      {/* ================================= */}

      <section className="mt-5">
        <div className="r9-surface px-6 py-8 sm:px-8">

          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-500/[0.08] blur-3xl" />


          <div className="relative">

            <div className="flex flex-wrap items-center gap-2">

              <span className="r9-badge">
                {organization.name}
              </span>


              <CampaignStatus
                status={
                  campaign.status
                }
              />


              {hasDeliveryQueue &&
              campaign.status ===
                "DRAFT" &&
              !hasProviderHistory && (

                <span className="r9-badge r9-badge--success">
                  ANTREAN SIAP
                </span>

              )}

            </div>


            <p className="r9-kicker mt-5">
              Pratinjau Email
            </p>


            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-100">
              {campaign.name}
            </h1>


            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Pratinjau personalisasi, antrean pengiriman,
              dan status pengiriman kampanye.
            </p>

          </div>

        </div>

      </section>


      {errorMessage ? <FlashNotice tone="error" message={errorMessage} /> : null}
      {successMessage ? <FlashNotice tone="success" message={successMessage} /> : null}

      {/* ================================= */}
      {/* CAMPAIGN SUMMARY */}
      {/* ================================= */}

      <section className="mt-4 grid gap-3 sm:grid-cols-3">

        <SummaryCard
          label="Penerima"
          value={
            String(
              recipients.length
            )
          }
        />


        <SummaryCard
          label="Mode"
          value={
            campaign.send_mode
          }
        />


        <SummaryCard
          label="Status"
          value={
            campaign.status
          }
        />

      </section>


      {!emailSenderReady ? (
        <section className="mt-4">
          <div className="r9-surface border-amber-400/30 bg-amber-400/[0.04] p-4">
            <p className="text-xs font-semibold text-amber-200">Email sender belum siap produksi</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">Lengkapi RESEND_API_KEY dan RESEND_FROM_EMAIL lalu restart aplikasi. Antrean boleh ditinjau, tetapi pengiriman nyata dan penjadwalan dikunci sampai sender siap.</p>
          </div>
        </section>
      ) : null}

      {/* ================================= */}
      {/* DELIVERY */}
      {/* ================================= */}

      <section className="mt-4">

        <div className="r9-surface p-5">

          <div className="relative z-10">

            <div className="flex flex-col gap-5 lg:flex-row lg:flex-wrap lg:items-start">

              <div>

                <p className="r9-kicker">
                  Antrean Email
                </p>


                <h2 className="mt-2 text-lg font-semibold text-slate-100">
                  Status Pengiriman
                </h2>


                <p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">
                  Setiap pengiriman menyimpan snapshot
                  email personal untuk satu peserta.
                </p>

              </div>


              {/* GENERATE */}

              {canGenerateQueue && (

                <form
                  action={
                    generateDeliveries
                  }
                  className="shrink-0"
                >

                  <button
                    type="submit"
                    className="r9-button r9-button--primary"
                  >
                    {hasDeliveryQueue ? "Refresh Antrean Email" : "Siapkan Antrean Email"}
                  </button>

                </form>

              )}


              {campaign.status === "DRAFT" && hasProviderHistory ? (
                <div className="w-full rounded-[16px] border border-amber-400/15 bg-amber-400/[0.035] p-4 lg:max-w-md">
                  <p className="text-xs font-semibold text-amber-200">Histori provider dikunci</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">Sebagian pengiriman sudah pernah diproses Resend, jadi antrean tidak boleh dibangun ulang karena dapat mengirim email duplikat. Gunakan Coba Lagi Gagal hanya untuk pengiriman yang belum pernah diterima Resend.</p>
                </div>
              ) : null}

              {campaign.status === "DRAFT" && (
                <form action={sendTest} className="w-full shrink-0 lg:w-[280px]">
                  <div className="rounded-[18px] border border-cyan-400/15 bg-cyan-400/[0.035] p-4">
                    <p className="text-xs font-medium text-cyan-100">Kirim Test Dulu</p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">Kode akses pada test memakai kode contoh, bukan credential peserta asli.</p>
                    <input name="test_email" type="email" required placeholder="email.tester@gmail.com" className="r9-input mt-3 text-xs" />
                    <button type="submit" disabled={!emailSenderReady} className="r9-button r9-button--secondary mt-3 w-full disabled:opacity-40">Kirim Email Test</button>
                  </div>
                </form>
              )}

              {canRetryFailed && (
                <form action={retryFailed} className="shrink-0">
                  <button type="submit" className="r9-button r9-button--secondary">Coba Lagi Gagal · {failedCount}</button>
                </form>
              )}

              {canCancelScheduled && (
                <form action={cancelScheduled} className="shrink-0">
                  <button type="submit" className="r9-button r9-button--danger">Batalkan Jadwal</button>
                </form>
              )}

              {canSyncProvider && (
                <form action={syncProvider} className="shrink-0">
                  <button type="submit" className="r9-button r9-button--secondary">Sinkronkan Status Resend</button>
                </form>
              )}

              {/* SEND NOW */}

              {canSendNow && (

                <form
                  action={
                    sendNow
                  }
                  className="w-full shrink-0 lg:w-[280px]"
                >

                  <div className="rounded-[18px] border border-amber-400/15 bg-amber-400/[0.04] p-4">

                    <p className="text-xs font-medium text-amber-200">
                      Siap dikirim
                    </p>


                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                      Tombol di bawah akan benar-benar
                      mengirim {pendingCount} email
                      melalui Resend.
                    </p>


                    <label className="mt-3 flex cursor-pointer items-start gap-2">

                      <input
                        type="checkbox"
                        required
                        className="mt-0.5"
                      />


                      <span className="text-[11px] leading-5 text-slate-400">
                        Saya sudah memeriksa penerima
                        dan isi email.
                      </span>

                    </label>


                    <button
                      type="submit"
                      className="r9-button r9-button--primary mt-4 w-full"
                    >
                      Kirim Sekarang · {pendingCount} Email
                    </button>

                  </div>

                </form>

              )}


              {/* SCHEDULE */}

              {canSchedule && (

                <form
                  action={
                    scheduleDelivery
                  }
                  className="w-full shrink-0 lg:w-[300px]"
                >

                  <div className="r9-surface border-cyan-400/30 bg-cyan-400/[0.04] p-4">

                    <p className="text-xs font-medium text-cyan-200">
                      Siap dijadwalkan
                    </p>


                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                      {pendingCount} email akan dijadwalkan
                      melalui Resend untuk:
                    </p>


                    <div className="r9-surface-subtle mt-3 px-3 py-2.5">

                      <p className="text-[11px] font-medium leading-5 text-cyan-200">
                        {formatWib(
                          campaign.scheduled_at
                        )} WIB
                      </p>

                    </div>


                    <label className="mt-3 flex cursor-pointer items-start gap-2">

                      <input
                        type="checkbox"
                        required
                        className="mt-0.5"
                      />


                      <span className="text-[11px] leading-5 text-slate-400">
                        Saya sudah memeriksa penerima,
                        isi email, dan jadwal pengiriman.
                      </span>

                    </label>


                    <button
                      type="submit"
                      className="r9-button r9-button--primary mt-4 w-full"
                    >
                      Jadwalkan · {pendingCount} Email
                    </button>

                  </div>

                </form>

              )}


              {/* SCHEDULED */}

              {campaignScheduled && (

                <div className="r9-surface shrink-0 border-cyan-400/30 bg-cyan-400/[0.045] px-5 py-4">

                  <p className="text-xs font-medium text-cyan-200">
                    Kampanye terjadwal
                  </p>


                  <p className="mt-1 text-[11px] text-slate-500">
                    {scheduledCount} pengiriman TERJADWAL
                  </p>


                  {campaign.scheduled_at && (

                    <p className="mt-2 text-[11px] leading-5 text-cyan-200/80">
                      {formatWib(
                        campaign.scheduled_at
                      )} WIB
                    </p>

                  )}

                </div>

              )}


              {/* SENT */}

              {campaignSent && (

                <div className="shrink-0 rounded-[18px] border border-emerald-400/15 bg-emerald-400/[0.045] px-5 py-4">

                  <p className="text-xs font-medium text-emerald-200">
                    Kampanye terkirim
                  </p>


                  <p className="mt-1 text-[11px] text-slate-500">
                    {sentCount} delivery SENT
                  </p>

                </div>

              )}


              {campaignCanceled && (
                <div className="shrink-0 rounded-[18px] border border-rose-400/15 bg-rose-400/[0.045] px-5 py-4">
                  <p className="text-xs font-medium text-rose-200">Kampanye dibatalkan</p>
                  <p className="mt-1 text-[11px] text-slate-500">Jadwal provider yang berhasil dibatalkan tidak akan dikirim.</p>
                </div>
              )}

              {/* FAILED */}

              {campaignFailed && (

                <div className="shrink-0 rounded-[18px] border border-rose-400/15 bg-rose-400/[0.045] px-5 py-4">

                  <p className="text-xs font-medium text-rose-200">
                    Pengiriman gagal
                  </p>


                  <p className="mt-1 text-[11px] text-slate-500">
                    {failedCount} delivery FAILED
                  </p>

                </div>

              )}


              {/* PARTIAL */}

              {campaignPartial && (

                <div className="shrink-0 rounded-[18px] border border-amber-400/15 bg-amber-400/[0.04] px-5 py-4">

                  <p className="text-xs font-medium text-amber-200">
                    Sebagian berhasil
                  </p>


                  <p className="mt-1 text-[11px] text-slate-500">
                    {campaign.send_mode ===
                    "SCHEDULED"
                      ? `${scheduledCount} scheduled · ${failedCount} failed`
                      : `${sentCount} sent · ${failedCount} failed`}
                  </p>

                </div>

              )}

            </div>


            {/* METRICS */}

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">

              <DeliveryMetric
                label="Total"
                value={
                  deliveryCount
                }
              />


              <DeliveryMetric
                label="Pending"
                value={
                  pendingCount
                }
                valueClassName="text-amber-300"
              />


              <DeliveryMetric
                label="Processing"
                value={
                  processingCount
                }
                valueClassName="text-cyan-300"
              />


              <DeliveryMetric
                label="Scheduled"
                value={
                  scheduledCount
                }
                valueClassName="text-cyan-300"
              />


              <DeliveryMetric
                label="Sent"
                value={
                  sentCount
                }
                valueClassName="text-emerald-300"
              />


              <DeliveryMetric
                label="Failed"
                value={
                  failedCount
                }
                valueClassName="text-rose-300"
              />

            </div>

          </div>

        </div>

      </section>


      {/* ================================= */}
      {/* PREVIEW */}
      {/* ================================= */}

      <section className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">

        {/* ================================= */}
        {/* LEFT */}
        {/* ================================= */}

        <div className="space-y-5">

          {/* SAMPLE RECIPIENT */}

          <div className="r9-surface p-5">

            <div className="relative z-10">

              <p className="text-xs uppercase tracking-[0.16em] text-emerald-300/60">
                Sample Recipient
              </p>


              <h2 className="mt-2 font-semibold text-slate-100">
                Pratinjau Peserta
              </h2>


              <div className="mt-5 rounded-[18px] border border-emerald-400/10 bg-emerald-400/[0.025] p-4">

                <p className="font-medium text-slate-200">
                  {
                    sampleRecipient.display_name
                  }
                </p>


                <p className="mt-1 break-all text-xs text-slate-500">
                  {
                    sampleRecipient.email
                  }
                </p>


                <p className="mt-3 font-mono text-xs text-cyan-300/70">
                  {
                    sampleRecipient.candidate_code
                  }
                </p>

              </div>

            </div>

          </div>


          {/* VARIABLES */}

          <div className="r9-surface p-5">

            <div className="relative z-10">

              <p className="r9-kicker">
                Variabel Pratinjau
              </p>


              <div className="mt-4 space-y-3">

                <VariableRow
                  label="{{nama_peserta}}"
                  value={
                    variables.nama_peserta
                  }
                />


                <VariableRow
                  label="{{kode_peserta}}"
                  value={
                    variables.kode_peserta
                  }
                />


                <VariableRow
                  label="{{nama_ujian}}"
                  value={
                    variables.nama_ujian
                  }
                />


                <VariableRow
                  label="{{tanggal_ujian}}"
                  value={
                    variables.tanggal_ujian
                  }
                />


                <VariableRow
                  label="{{durasi_ujian}}"
                  value={
                    variables.durasi_ujian
                  }
                />


                <VariableRow
                  label="{{link_ujian}}"
                  value={
                    variables.link_ujian
                  }
                />

                <VariableRow label="{{kode_akses}}" value={variables.kode_akses} />
                <VariableRow label="{{waktu_login}}" value={variables.waktu_login} />
                <VariableRow label="{{hard_close}}" value={variables.hard_close} />
                <VariableRow label="{{nama_organisasi}}" value={variables.nama_organisasi} />

              </div>

            </div>

          </div>


          {/* DELIVERY RECIPIENTS */}

          {hasDeliveryQueue && (

            <div className="r9-surface p-5">

              <div className="relative z-10">

                <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/60">
                  Penerima Antrean
                </p>


                <h3 className="mt-2 font-semibold text-slate-100">
                  Queue Peserta
                </h3>


                <div className="mt-4 space-y-2">

                  {deliveries.map(
                    (
                      delivery
                    ) => (

                      <div
                        key={
                          delivery.id
                        }
                        className="rounded-[14px] border border-white/[0.05] bg-white/[0.02] p-3"
                      >

                        <div className="flex items-start justify-between gap-3">

                          <div className="min-w-0">

                            <p className="truncate text-xs font-medium text-slate-300">
                              {
                                delivery.recipient_name
                              }
                            </p>


                            <p className="mt-1 truncate text-[11px] text-slate-600">
                              {
                                delivery.recipient_email
                              }
                            </p>

                          </div>


                          <DeliveryStatus
                            status={
                              delivery.status
                            }
                          />

                        </div>


                        {delivery.last_error && (

                          <div className="mt-3 rounded-[10px] border border-rose-400/10 bg-rose-400/[0.03] p-2.5">

                            <p className="break-words text-[11px] leading-4 text-rose-300/70">
                              {
                                delivery.last_error
                              }
                            </p>

                          </div>

                        )}


                        {delivery.provider_message_id && (

                          <p className="mt-2 break-all font-mono text-[11px] text-slate-700">
                            ID: {
                              delivery.provider_message_id
                            }
                          </p>

                        )}

                      </div>

                    )
                  )}

                </div>

              </div>

            </div>

          )}

        </div>


        {/* ================================= */}
        {/* EMAIL PREVIEW */}
        {/* ================================= */}

        <div className="r9-surface overflow-hidden">

          <div className="relative z-10">

            <div className="border-b border-white/[0.06] px-6 py-5">

              <div className="flex flex-wrap items-center justify-between gap-3">

                <div>

                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-600">
                    Pratinjau Email
                  </p>


                  <p className="mt-1 text-xs text-slate-500">
                    Konten setelah variabel ditampilkan.
                  </p>

                </div>


                {campaignSent ? (

                  <span className="r9-badge r9-badge--success">
                    TERKIRIM
                  </span>

                ) : campaignScheduled ? (

                  <span className="r9-badge r9-badge--accent">
                    TERJADWAL
                  </span>

                ) : (

                  <span className="r9-badge r9-badge--warning">
                    BELUM DIKIRIM
                  </span>

                )}

              </div>

            </div>


            {/* EMAIL HEADER */}

            <div className="border-b border-white/[0.06] px-6 py-5">

              <div className="grid gap-4">

                <EmailField
                  label="To"
                  value={
                    `${sampleRecipient.display_name} <${sampleRecipient.email}>`
                  }
                />


                <EmailField
                  label="Subject"
                  value={
                    renderedSubject
                  }
                />

              </div>

            </div>


            {/* EMAIL BODY */}

            <div className="p-6 sm:p-8">

              <div className="rounded-[22px] border border-white/[0.06] bg-black/10 p-6">

                <div className="mb-6 flex items-center gap-3">

                  <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-cyan-400/20 bg-white/[0.04] p-2">
                    <Image src="/vectr-mark.png" alt="VECTR" width={34} height={34} className="h-full w-full object-contain" />
                  </div>


                  <div>

                    <p className="text-sm font-semibold text-slate-200">
                      {organization.name}
                    </p>


                    <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-slate-600">
                      VECTR Exam Platform
                    </p>

                  </div>

                </div>


                <div className="r9-divider mb-6" />


                <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">
                  {renderedBody}
                </div>

              </div>

            </div>


            {/* FOOTER */}

            <div className="border-t border-white/[0.06] px-6 py-5">

              <div
                className={
                  campaignSent
                    ? "r9-surface-subtle border-emerald-400/30 bg-emerald-400/[0.03] p-4"
                    : campaignScheduled
                      ? "r9-surface-subtle border-cyan-400/30 bg-cyan-400/[0.03] p-4"
                      : "r9-surface-subtle border-cyan-400/30 bg-cyan-400/[0.03] p-4"
                }
              >

                <p
                  className={
                    campaignSent
                      ? "text-xs font-medium text-emerald-200"
                      : campaignScheduled
                        ? "text-xs font-medium text-cyan-200"
                        : "text-xs font-medium text-cyan-200"
                  }
                >
                  {
                    campaignSent
                      ? "Diproses Resend"
                      : campaignScheduled
                        ? "Terjadwal di Resend"
                        : hasDeliveryQueue
                          ? "Antrean Siap"
                          : "Hanya Pratinjau"
                  }
                </p>


                <p className="mt-1 text-[11px] leading-5 text-slate-500">

                  {campaignSent
                    ? `Kampanye selesai dikirim. ${sentCount} email berstatus SENT.`
                    : campaignScheduled
                      ? `${scheduledCount} email sudah diterima scheduler Resend dan dijadwalkan untuk ${formatWib(
                          campaign.scheduled_at
                        )} WIB.`
                      : hasDeliveryQueue
                        ? campaign.send_mode ===
                          "SCHEDULED"
                          ? "Snapshot email personal sudah siap. Periksa penerima dan jadwal sebelum melakukan scheduling."
                          : "Snapshot email personal sudah siap. Periksa penerima sebelum melakukan pengiriman."
                        : "Belum ada email yang dikirim. Siapkan antrean pengiriman setelah pratinjau sudah sesuai."}

                </p>


                {campaign.sent_at && (

                  <p className="mt-2 text-[11px] text-slate-600">
                    Selesai: {
                      formatWib(
                        campaign.sent_at
                      )
                    } WIB
                  </p>

                )}

              </div>

            </div>

          </div>

        </div>

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
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="r9-surface p-4">

      <div className="relative z-10">

        <p className="text-xs text-slate-500">
          {label}
        </p>


        <p className="mt-2 truncate text-lg font-semibold text-white">
          {value}
        </p>

      </div>

    </div>
  );
}


// =====================================
// DELIVERY METRIC
// =====================================

function DeliveryMetric({
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
    <div className="rounded-[16px] border border-white/[0.05] bg-white/[0.02] p-4">

      <p className="text-[11px] uppercase tracking-wider text-slate-600">
        {label}
      </p>


      <p
        className={`mt-2 text-xl font-bold ${valueClassName}`}
      >
        {value}
      </p>

    </div>
  );
}


// =====================================
// VARIABLE ROW
// =====================================

function VariableRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[14px] border border-white/[0.05] bg-white/[0.02] p-3">

      <code className="text-[11px] text-cyan-300">
        {label}
      </code>


      <p className="mt-1 break-words text-[11px] leading-5 text-slate-500">
        {value}
      </p>

    </div>
  );
}


// =====================================
// EMAIL FIELD
// =====================================

function EmailField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[70px_1fr] sm:gap-4">

      <p className="text-xs text-slate-600">
        {label}
      </p>


      <p className="break-words text-xs text-slate-300">
        {value}
      </p>

    </div>
  );
}


// =====================================
// DELIVERY STATUS
// =====================================

function DeliveryStatus({
  status,
}: {
  status: string;
}) {
  if (
    status ===
    "SENT"
  ) {
    return (
      <span className="r9-badge r9-badge--success shrink-0">
        SENT
      </span>
    );
  }


  if (
    status ===
    "FAILED"
  ) {
    return (
      <span className="r9-badge r9-badge--danger shrink-0">
        FAILED
      </span>
    );
  }


  if (
    status ===
    "PROCESSING"
  ) {
    return (
      <span className="r9-badge r9-badge--accent shrink-0">
        PROCESSING
      </span>
    );
  }


  if (
    status ===
    "SCHEDULED"
  ) {
    return (
      <span className="r9-badge r9-badge--accent shrink-0">
        SCHEDULED
      </span>
    );
  }


  return (
    <span className="r9-badge r9-badge--warning shrink-0">
      PENDING
    </span>
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


// =====================================
// NOT FOUND
// =====================================

function NotFoundCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-8">

      <div className="r9-surface p-8 text-center">

        <div className="relative z-10">

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/15 bg-rose-400/[0.06] text-lg font-bold text-rose-300">
            !
          </div>


          <h1 className="mt-5 text-2xl font-bold text-slate-100">
            {title}
          </h1>


          <p className="mt-2 text-sm text-slate-500">
            {description}
          </p>


          <Link
            href={
              href
            }
            className="r9-button r9-button--secondary mt-6"
          >
            Kembali
          </Link>

        </div>

      </div>

    </main>
  );
}
