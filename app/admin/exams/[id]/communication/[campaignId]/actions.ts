"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { decryptAccessCode } from "@/lib/access-code-crypto";
import { databaseErrorMessage, logDatabaseError } from "@/lib/db-error";
import {
  buildParticipantEmailHtml,
  renderExamEmailTemplate,
  templateUsesAccessCode,
} from "@/lib/exam-email";
import { getPublicAppOrigin } from "@/lib/platform-email";
import {
  getResendClient,
  getResendFromEmail,
  getResendReplyToEmail,
} from "@/lib/resend";
import {
  ensureScheduleWithinSubscription,
  requireAdminWriteAccess,
} from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";

function redirectWithError(examId: string, campaignId: string, message: string): never {
  redirect(`/admin/exams/${examId}/communication/${campaignId}?error=${encodeURIComponent(message)}`);
}

function redirectWithSuccess(examId: string, campaignId: string, message: string): never {
  redirect(`/admin/exams/${examId}/communication/${campaignId}?success=${encodeURIComponent(message)}`);
}

function formatWib(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function getResendErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Provider email mengembalikan error.");
  }
  if (error instanceof Error) return error.message;
  return "Provider email mengembalikan error yang tidak diketahui.";
}

function campaignPath(examId: string, campaignId: string) {
  return `/admin/exams/${examId}/communication/${campaignId}`;
}

function refreshCampaign(examId: string, campaignId: string) {
  revalidatePath(`/admin/exams/${examId}/communication`);
  revalidatePath(campaignPath(examId, campaignId));
}

async function loadCore(examId: string, campaignId: string, organizationId: string) {
  const supabase = createAdminClient();
  const [examResult, campaignResult, organizationResult] = await Promise.all([
    supabase
      .from("exams")
      .select("id, organization_id, batch_id, title, login_open_at, starts_at, hard_close_at, duration_minutes, status")
      .eq("id", examId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("exam_email_campaigns")
      .select("id, organization_id, exam_id, name, subject_template, body_template, send_mode, scheduled_at, status, settings")
      .eq("id", campaignId)
      .eq("exam_id", examId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);

  if (examResult.error) throw new Error("Gagal memvalidasi ujian.");
  if (campaignResult.error) throw new Error("Gagal memvalidasi campaign email.");
  if (organizationResult.error) throw new Error("Gagal membaca organisasi.");
  if (!examResult.data) redirectWithError(examId, campaignId, "Ujian tidak ditemukan pada organisasi aktif.");
  if (!campaignResult.data) redirectWithError(examId, campaignId, "Campaign email tidak ditemukan.");
  if (!organizationResult.data) redirectWithError(examId, campaignId, "Organisasi tidak ditemukan.");

  return {
    supabase,
    exam: examResult.data,
    campaign: campaignResult.data,
    organization: organizationResult.data,
  };
}

function baseVariables(input: {
  candidate: { display_name: string; candidate_code: string };
  exam: {
    title: string;
    login_open_at: string | null;
    starts_at: string | null;
    hard_close_at: string | null;
    duration_minutes: number;
  };
  organizationName: string;
  participantLink: string;
}) {
  return {
    nama_peserta: String(input.candidate.display_name),
    kode_peserta: String(input.candidate.candidate_code),
    nama_ujian: String(input.exam.title),
    nama_organisasi: input.organizationName,
    tanggal_ujian: `${formatWib(input.exam.starts_at)} WIB`,
    waktu_login: `${formatWib(input.exam.login_open_at)} WIB`,
    hard_close: `${formatWib(input.exam.hard_close_at)} WIB`,
    durasi_ujian: `${input.exam.duration_minutes} menit`,
    link_ujian: input.participantLink,
  };
}

async function getCredentialMap(
  supabase: ReturnType<typeof createAdminClient>,
  examId: string,
  candidateIds: string[]
) {
  if (!candidateIds.length) return new Map<string, string | null>();
  const { data, error } = await supabase
    .from("exam_assignments")
    .select("candidate_id, access_code_ciphertext")
    .eq("exam_id", examId)
    .eq("active", true)
    .in("candidate_id", candidateIds);
  if (error) throw new Error("Gagal membaca credential peserta.");
  return new Map(
    (data ?? []).map((row) => [
      String(row.candidate_id),
      row.access_code_ciphertext ? String(row.access_code_ciphertext) : null,
    ])
  );
}

function renderCredentialAtSendTime(input: {
  subject: string;
  body: string;
  ciphertext: string | null | undefined;
}) {
  const needsCredential = templateUsesAccessCode(input.subject, input.body);
  if (!needsCredential) return { subject: input.subject, body: input.body };
  if (!input.ciphertext) {
    throw new Error("Credential peserta belum tersedia. Buat / Perbaiki Credential terlebih dahulu.");
  }
  const accessCode = decryptAccessCode(input.ciphertext);
  return {
    subject: renderExamEmailTemplate(input.subject, { kode_akses: accessCode }),
    body: renderExamEmailTemplate(input.body, { kode_akses: accessCode }),
  };
}

async function assertPendingDeliveriesStillEligible(input: {
  supabase: ReturnType<typeof createAdminClient>;
  organizationId: string;
  examId: string;
  batchId: string;
  deliveries: Array<{ candidate_id: string; recipient_email: string; recipient_name: string }>;
}) {
  const candidateIds = [...new Set(input.deliveries.map((delivery) => String(delivery.candidate_id)))];
  if (!candidateIds.length) return;

  const [{ data: assignmentRows, error: assignmentError }, { data: candidateRows, error: candidateError }] = await Promise.all([
    input.supabase
      .from("exam_assignments")
      .select("candidate_id")
      .eq("exam_id", input.examId)
      .eq("active", true)
      .in("candidate_id", candidateIds),
    input.supabase
      .from("candidates")
      .select("id, batch_id, display_name, email, active")
      .eq("organization_id", input.organizationId)
      .eq("batch_id", input.batchId)
      .eq("active", true)
      .in("id", candidateIds),
  ]);

  if (assignmentError || candidateError) {
    throw new Error("Gagal memvalidasi ulang penerima email sebelum pengiriman.");
  }

  const activeAssignments = new Set((assignmentRows ?? []).map((row) => String(row.candidate_id)));
  const currentCandidates = new Map(
    (candidateRows ?? []).map((row) => [
      String(row.id),
      {
        email: row.email ? String(row.email).trim().toLowerCase() : "",
        name: String(row.display_name),
      },
    ])
  );

  const stale = input.deliveries.filter((delivery) => {
    const candidateId = String(delivery.candidate_id);
    const current = currentCandidates.get(candidateId);
    return (
      !activeAssignments.has(candidateId) ||
      !current ||
      !current.email ||
      current.email !== String(delivery.recipient_email).trim().toLowerCase() ||
      current.name !== String(delivery.recipient_name)
    );
  });

  if (stale.length) {
    throw new Error(
      `${stale.length} snapshot penerima sudah berubah sejak antrean dibuat. Refresh Antrean Email terlebih dahulu agar peserta yang pindah batch, dinonaktifkan, berganti nama, atau berganti email tidak menerima data lama.`
    );
  }
}

export async function generateCampaignDeliveries(examId: string, campaignId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const { supabase, exam, campaign, organization } = await loadCore(examId, campaignId, organizationId);

  if (campaign.status !== "DRAFT") {
    redirectWithError(examId, campaignId, "Delivery queue hanya dapat disiapkan saat campaign masih DRAFT.");
  }

  const credentialCampaign = templateUsesAccessCode(campaign.subject_template, campaign.body_template);
  if (credentialCampaign && String(exam.status) !== "ACTIVE") {
    redirectWithError(examId, campaignId, "Campaign yang mengirim kode akses hanya dapat disiapkan saat ujian berstatus ACTIVE.");
  }
  if (credentialCampaign && new Date(String(exam.hard_close_at)).getTime() <= Date.now()) {
    redirectWithError(examId, campaignId, "Kode akses tidak boleh dikirim setelah Hard Close ujian lewat.");
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("exam_assignments")
    .select("candidate_id, access_code_ciphertext")
    .eq("exam_id", examId)
    .eq("active", true);
  if (assignmentsError) throw new Error("Gagal membaca peserta ujian.");

  const assignmentMap = new Map(
    (assignments ?? []).map((row) => [String(row.candidate_id), row.access_code_ciphertext ? String(row.access_code_ciphertext) : null])
  );
  const candidateIds = [...assignmentMap.keys()];
  if (!candidateIds.length) redirectWithError(examId, campaignId, "Ujian belum memiliki peserta aktif.");

  const { data: candidateRows, error: candidatesError } = await supabase
    .from("candidates")
    .select("id, candidate_code, display_name, email, active")
    .eq("organization_id", organizationId)
    .eq("batch_id", String(exam.batch_id))
    .eq("active", true)
    .in("id", candidateIds)
    .order("display_name");
  if (candidatesError) throw new Error("Gagal membaca data peserta.");

  const recipients = (candidateRows ?? []).filter((candidate) => Boolean(candidate.email?.trim()));
  if (!recipients.length) redirectWithError(examId, campaignId, "Tidak ada peserta ujian yang memiliki alamat email.");

  if (credentialCampaign) {
    const missingCredential = recipients.filter((candidate) => !assignmentMap.get(String(candidate.id)));
    if (missingCredential.length) {
      redirectWithError(
        examId,
        campaignId,
        `${missingCredential.length} peserta belum memiliki credential. Jalankan “Buat / Perbaiki Credential” di halaman Ujian sebelum menyiapkan email.`
      );
    }
  }

  const origin = await getPublicAppOrigin();
  const participantLink = `${origin}/join/${exam.id}`;

  // Queue boleh di-refresh selama belum ada delivery yang sudah diterima provider.
  // Ini mencegah histori SENT/SCHEDULED hilang lalu penerima yang sama terkirim dua kali.
  const { data: existingDeliveries, error: existingDeliveryError } = await supabase
    .from("exam_email_deliveries")
    .select("id, status, provider_message_id")
    .eq("campaign_id", campaignId)
    .eq("organization_id", organizationId);
  if (existingDeliveryError) throw new Error("Gagal memeriksa histori delivery campaign.");
  const hasProviderHistory = (existingDeliveries ?? []).some(
    (delivery) => Boolean(delivery.provider_message_id) || ["SENT", "SCHEDULED", "PROCESSING"].includes(String(delivery.status))
  );
  if (hasProviderHistory) {
    redirectWithError(
      examId,
      campaignId,
      "Antrean tidak dapat di-refresh karena sebagian email sudah pernah diproses provider. Gunakan Retry Gagal untuk delivery yang aman diulang; histori email yang sudah terkirim tidak akan dihapus."
    );
  }

  // Queue adalah snapshot. Saat belum pernah diproses provider, regenerate benar-benar
  // merefleksikan data peserta/jadwal terbaru dan membuang penerima yang sudah tidak aktif.
  const { error: deleteError } = await supabase
    .from("exam_email_deliveries")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("organization_id", organizationId);
  if (deleteError) {
    throw new Error(databaseErrorMessage("EMAIL_DELIVERY_QUEUE_RESET", "Delivery queue lama gagal di-refresh.", deleteError));
  }

  const deliveries = recipients.map((candidate) => {
    const variables = baseVariables({
      candidate: {
        display_name: String(candidate.display_name),
        candidate_code: String(candidate.candidate_code),
      },
      exam: {
        title: String(exam.title),
        login_open_at: exam.login_open_at,
        starts_at: exam.starts_at,
        hard_close_at: exam.hard_close_at,
        duration_minutes: Number(exam.duration_minutes),
      },
      organizationName: String(organization.name),
      participantLink,
    });

    // kode_akses sengaja TIDAK didekripsi ke snapshot database. Placeholder
    // dipertahankan dan hanya ditampilkan in-memory tepat sebelum request ke Resend.
    return {
      campaign_id: campaign.id,
      organization_id: organizationId,
      exam_id: exam.id,
      candidate_id: candidate.id,
      recipient_name: String(candidate.display_name),
      recipient_email: String(candidate.email).trim(),
      subject_rendered: renderExamEmailTemplate(campaign.subject_template, variables),
      body_rendered: renderExamEmailTemplate(campaign.body_template, variables),
      status: "PENDING",
      attempt_count: 0,
      provider_message_id: null,
      last_error: null,
      processing_at: null,
      next_attempt_at: null,
      sent_at: null,
      failed_at: null,
      updated_at: new Date().toISOString(),
    };
  });

  const { error: insertError } = await supabase.from("exam_email_deliveries").insert(deliveries);
  if (insertError) {
    logDatabaseError("EMAIL_DELIVERY_QUEUE_CREATE", insertError);
    throw new Error(databaseErrorMessage("EMAIL_DELIVERY_QUEUE_CREATE", "Gagal membuat delivery queue.", insertError));
  }

  const currentSettings = campaign.settings && typeof campaign.settings === "object" ? campaign.settings : {};
  await supabase
    .from("exam_email_campaigns")
    .update({
      settings: {
        ...currentSettings,
        recipient_count: recipients.length,
        queue_generated_at: new Date().toISOString(),
        credential_in_template: credentialCampaign,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .eq("organization_id", organizationId);

  refreshCampaign(examId, campaignId);
  redirectWithSuccess(examId, campaignId, `Delivery queue di-refresh untuk ${recipients.length} peserta. Belum ada email yang dikirim.`);
}

async function prepareSendContext(examId: string, campaignId: string, organizationId: string) {
  const core = await loadCore(examId, campaignId, organizationId);
  let resend: ReturnType<typeof getResendClient>;
  let from: string;
  try {
    resend = getResendClient();
    from = getResendFromEmail();
  } catch (error) {
    redirectWithError(examId, campaignId, error instanceof Error ? error.message : "Konfigurasi email belum lengkap.");
  }
  return { ...core, resend, from, replyTo: getResendReplyToEmail() };
}

async function sendOneDelivery(input: {
  resend: ReturnType<typeof getResendClient>;
  from: string;
  replyTo?: string;
  organizationName: string;
  examTitle: string;
  examId: string;
  delivery: {
    id: string;
    candidate_id: string;
    recipient_email: string;
    subject_rendered: string;
    body_rendered: string;
  };
  ciphertext: string | null | undefined;
  scheduledAt?: string;
}) {
  const rendered = renderCredentialAtSendTime({
    subject: String(input.delivery.subject_rendered),
    body: String(input.delivery.body_rendered),
    ciphertext: input.ciphertext,
  });
  const origin = await getPublicAppOrigin();
  const participantLink = `${origin}/join/${input.examId}`;

  return input.resend.emails.send(
    {
      from: input.from,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      to: [String(input.delivery.recipient_email)],
      subject: rendered.subject,
      text: rendered.body,
      html: buildParticipantEmailHtml({
        organizationName: input.organizationName,
        examTitle: input.examTitle,
        bodyText: rendered.body,
        participantLink,
      }),
      ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
    },
    { idempotencyKey: `${input.scheduledAt ? "exam-schedule" : "exam-delivery"}/${input.delivery.id}` }
  );
}

export async function sendCampaignNow(examId: string, campaignId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const { supabase, exam, campaign, organization, resend, from, replyTo } = await prepareSendContext(examId, campaignId, organizationId);

  if (campaign.send_mode !== "NOW") redirectWithError(examId, campaignId, "Campaign ini bukan campaign Kirim Sekarang.");
  if (campaign.status !== "DRAFT") redirectWithError(examId, campaignId, `Campaign tidak dapat dikirim karena statusnya ${campaign.status}.`);
  if (templateUsesAccessCode(campaign.subject_template, campaign.body_template)) {
    if (String(exam.status) !== "ACTIVE") redirectWithError(examId, campaignId, "Kode akses hanya boleh dikirim saat ujian ACTIVE.");
    if (new Date(String(exam.hard_close_at)).getTime() <= Date.now()) redirectWithError(examId, campaignId, "Kode akses tidak boleh dikirim setelah Hard Close ujian lewat.");
  }

  const { data: pendingDeliveries, error: deliveriesError } = await supabase
    .from("exam_email_deliveries")
    .select("id, candidate_id, recipient_name, recipient_email, subject_rendered, body_rendered, status, attempt_count")
    .eq("campaign_id", campaignId)
    .eq("organization_id", organizationId)
    .eq("exam_id", examId)
    .eq("status", "PENDING")
    .order("created_at", { ascending: true });
  if (deliveriesError) throw new Error("Gagal membaca delivery queue.");
  if (!pendingDeliveries?.length) redirectWithError(examId, campaignId, "Tidak ada delivery PENDING. Siapkan atau refresh delivery queue terlebih dahulu.");

  try {
    await assertPendingDeliveriesStillEligible({
      supabase,
      organizationId,
      examId,
      batchId: String(exam.batch_id),
      deliveries: pendingDeliveries.map((delivery) => ({
        candidate_id: String(delivery.candidate_id),
        recipient_email: String(delivery.recipient_email),
        recipient_name: String(delivery.recipient_name),
      })),
    });
  } catch (error) {
    redirectWithError(examId, campaignId, error instanceof Error ? error.message : "Antrean email sudah tidak sesuai data peserta terbaru.");
  }

  const { data: claimedCampaign, error: claimError } = await supabase
    .from("exam_email_campaigns")
    .update({ status: "SENDING", updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("organization_id", organizationId)
    .eq("status", "DRAFT")
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(databaseErrorMessage("EMAIL_CAMPAIGN_SEND_CLAIM", "Gagal memulai proses pengiriman.", claimError));
  if (!claimedCampaign) redirectWithError(examId, campaignId, "Campaign sedang diproses atau statusnya sudah berubah. Muat ulang halaman.");

  const credentialMap = await getCredentialMap(supabase, examId, pendingDeliveries.map((delivery) => String(delivery.candidate_id)));
  let sentCount = 0;
  let failedCount = 0;

  for (const delivery of pendingDeliveries) {
    const attemptCount = Number(delivery.attempt_count ?? 0) + 1;
    const processingAt = new Date().toISOString();
    const { data: claimedDelivery, error: processingError } = await supabase
      .from("exam_email_deliveries")
      .update({ status: "PROCESSING", attempt_count: attemptCount, processing_at: processingAt, last_error: null, updated_at: processingAt })
      .eq("id", delivery.id)
      .eq("campaign_id", campaignId)
      .eq("status", "PENDING")
      .select("id")
      .maybeSingle();
    if (processingError || !claimedDelivery) {
      failedCount += 1;
      continue;
    }

    try {
      const { data, error } = await sendOneDelivery({
        resend,
        from,
        replyTo,
        organizationName: String(organization.name),
        examTitle: String(exam.title),
        examId,
        delivery: {
          id: String(delivery.id),
          candidate_id: String(delivery.candidate_id),
          recipient_email: String(delivery.recipient_email),
          subject_rendered: String(delivery.subject_rendered),
          body_rendered: String(delivery.body_rendered),
        },
        ciphertext: credentialMap.get(String(delivery.candidate_id)),
      });

      if (error || !data?.id) throw new Error(getResendErrorMessage(error));
      const sentAt = new Date().toISOString();
      await supabase
        .from("exam_email_deliveries")
        .update({ status: "SENT", provider_message_id: data.id, last_error: null, sent_at: sentAt, failed_at: null, updated_at: sentAt })
        .eq("id", delivery.id);
      sentCount += 1;
    } catch (error) {
      const failedAt = new Date().toISOString();
      await supabase
        .from("exam_email_deliveries")
        .update({ status: "FAILED", last_error: getResendErrorMessage(error), failed_at: failedAt, updated_at: failedAt })
        .eq("id", delivery.id);
      failedCount += 1;
    }
  }

  const finalStatus = sentCount > 0 && failedCount === 0 ? "SENT" : sentCount > 0 ? "PARTIAL" : "FAILED";
  const finishedAt = new Date().toISOString();
  const { error: campaignUpdateError } = await supabase
    .from("exam_email_campaigns")
    .update({ status: finalStatus, sent_at: finalStatus === "SENT" ? finishedAt : null, updated_at: finishedAt })
    .eq("id", campaignId)
    .eq("organization_id", organizationId);
  if (campaignUpdateError) throw new Error("Email selesai diproses tetapi status campaign gagal diperbarui.");

  refreshCampaign(examId, campaignId);
  if (finalStatus === "SENT") redirectWithSuccess(examId, campaignId, `${sentCount} email diterima Resend untuk diproses.`);
  if (finalStatus === "PARTIAL") redirectWithSuccess(examId, campaignId, `${sentCount} email diterima Resend dan ${failedCount} email gagal diproses. Gunakan Retry Gagal setelah memeriksa detail.`);
  redirectWithError(examId, campaignId, `Pengiriman gagal untuk ${failedCount} email. Lihat status delivery untuk detail.`);
}

export async function scheduleCampaign(examId: string, campaignId: string) {
  const { organizationId, context, subscription } = await requireAdminWriteAccess();
  const { supabase, exam, campaign, organization, resend, from, replyTo } = await prepareSendContext(examId, campaignId, organizationId);

  if (campaign.send_mode !== "SCHEDULED") redirectWithError(examId, campaignId, "Campaign ini bukan campaign terjadwal.");
  if (campaign.status !== "DRAFT") redirectWithError(examId, campaignId, `Campaign tidak dapat dijadwalkan karena statusnya ${campaign.status}.`);
  if (!campaign.scheduled_at) redirectWithError(examId, campaignId, "Campaign belum memiliki jadwal pengiriman.");

  const scheduledAt = String(campaign.scheduled_at);
  const scheduledMs = new Date(scheduledAt).getTime();
  const nowMs = Date.now();
  if (Number.isNaN(scheduledMs) || scheduledMs <= nowMs) redirectWithError(examId, campaignId, "Jadwal pengiriman sudah lewat. Buat atau perbarui campaign dengan jadwal di masa mendatang.");
  if (scheduledMs > nowMs + 30 * 24 * 60 * 60 * 1000) redirectWithError(examId, campaignId, "Jadwal pengiriman maksimal 30 hari dari sekarang.");
  if (templateUsesAccessCode(campaign.subject_template, campaign.body_template)) {
    if (String(exam.status) !== "ACTIVE") redirectWithError(examId, campaignId, "Kode akses hanya boleh dijadwalkan saat ujian ACTIVE.");
    const hardCloseMs = new Date(String(exam.hard_close_at)).getTime();
    if (!Number.isFinite(hardCloseMs) || scheduledMs >= hardCloseMs) {
      redirectWithError(examId, campaignId, "Email credential harus dijadwalkan sebelum Hard Close ujian.");
    }
  }
  if (!context.profile.isPlatformOwner) {
    try {
      ensureScheduleWithinSubscription(subscription, scheduledMs, "Jadwal email");
    } catch (error) {
      redirectWithError(examId, campaignId, error instanceof Error ? error.message : "Jadwal email melewati masa aktif langganan.");
    }
  }

  const { data: pendingDeliveries, error: deliveriesError } = await supabase
    .from("exam_email_deliveries")
    .select("id, candidate_id, recipient_name, recipient_email, subject_rendered, body_rendered, status, attempt_count")
    .eq("campaign_id", campaignId)
    .eq("organization_id", organizationId)
    .eq("exam_id", examId)
    .eq("status", "PENDING")
    .order("created_at", { ascending: true });
  if (deliveriesError) throw new Error("Gagal membaca delivery queue.");
  if (!pendingDeliveries?.length) redirectWithError(examId, campaignId, "Tidak ada delivery PENDING. Siapkan atau refresh delivery queue terlebih dahulu.");

  try {
    await assertPendingDeliveriesStillEligible({
      supabase,
      organizationId,
      examId,
      batchId: String(exam.batch_id),
      deliveries: pendingDeliveries.map((delivery) => ({
        candidate_id: String(delivery.candidate_id),
        recipient_email: String(delivery.recipient_email),
        recipient_name: String(delivery.recipient_name),
      })),
    });
  } catch (error) {
    redirectWithError(examId, campaignId, error instanceof Error ? error.message : "Antrean email sudah tidak sesuai data peserta terbaru.");
  }

  const { data: claimedCampaign, error: claimError } = await supabase
    .from("exam_email_campaigns")
    .update({ status: "SENDING", updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("organization_id", organizationId)
    .eq("status", "DRAFT")
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(databaseErrorMessage("EMAIL_CAMPAIGN_SCHEDULE_CLAIM", "Gagal memulai proses penjadwalan.", claimError));
  if (!claimedCampaign) redirectWithError(examId, campaignId, "Campaign sedang diproses atau statusnya sudah berubah. Muat ulang halaman.");

  const credentialMap = await getCredentialMap(supabase, examId, pendingDeliveries.map((delivery) => String(delivery.candidate_id)));
  let scheduledCount = 0;
  let failedCount = 0;

  for (const delivery of pendingDeliveries) {
    const attemptCount = Number(delivery.attempt_count ?? 0) + 1;
    const processingAt = new Date().toISOString();
    const { data: claimedDelivery, error: processingError } = await supabase
      .from("exam_email_deliveries")
      .update({ status: "PROCESSING", attempt_count: attemptCount, processing_at: processingAt, last_error: null, updated_at: processingAt })
      .eq("id", delivery.id)
      .eq("campaign_id", campaignId)
      .eq("status", "PENDING")
      .select("id")
      .maybeSingle();
    if (processingError || !claimedDelivery) {
      failedCount += 1;
      continue;
    }

    try {
      const { data, error } = await sendOneDelivery({
        resend,
        from,
        replyTo,
        organizationName: String(organization.name),
        examTitle: String(exam.title),
        examId,
        delivery: {
          id: String(delivery.id),
          candidate_id: String(delivery.candidate_id),
          recipient_email: String(delivery.recipient_email),
          subject_rendered: String(delivery.subject_rendered),
          body_rendered: String(delivery.body_rendered),
        },
        ciphertext: credentialMap.get(String(delivery.candidate_id)),
        scheduledAt,
      });
      if (error || !data?.id) throw new Error(getResendErrorMessage(error));

      const recordedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("exam_email_deliveries")
        .update({ status: "SCHEDULED", provider_message_id: data.id, next_attempt_at: scheduledAt, last_error: null, failed_at: null, sent_at: null, updated_at: recordedAt })
        .eq("id", delivery.id)
        .eq("campaign_id", campaignId);

      if (updateError) {
        try {
          await resend.emails.cancel(data.id);
        } catch (cancelError) {
          console.error("RESEND SCHEDULE ROLLBACK ERROR:", cancelError);
        }
        throw new Error("Provider menerima jadwal, tetapi penyimpanan status lokal gagal. Sistem mencoba membatalkan jadwal provider.");
      }
      scheduledCount += 1;
    } catch (error) {
      const failedAt = new Date().toISOString();
      await supabase
        .from("exam_email_deliveries")
        .update({ status: "FAILED", last_error: getResendErrorMessage(error), failed_at: failedAt, updated_at: failedAt })
        .eq("id", delivery.id);
      failedCount += 1;
    }
  }

  const finalStatus = scheduledCount > 0 && failedCount === 0 ? "SCHEDULED" : scheduledCount > 0 ? "PARTIAL" : "FAILED";
  const finishedAt = new Date().toISOString();
  const { error: campaignUpdateError } = await supabase
    .from("exam_email_campaigns")
    .update({ status: finalStatus, sent_at: null, updated_at: finishedAt })
    .eq("id", campaignId)
    .eq("organization_id", organizationId);
  if (campaignUpdateError) throw new Error("Proses scheduling selesai tetapi status campaign gagal diperbarui.");

  refreshCampaign(examId, campaignId);
  if (finalStatus === "SCHEDULED") redirectWithSuccess(examId, campaignId, `${scheduledCount} email dijadwalkan untuk ${formatWib(scheduledAt)} WIB.`);
  if (finalStatus === "PARTIAL") redirectWithSuccess(examId, campaignId, `${scheduledCount} email berhasil dijadwalkan dan ${failedCount} gagal. Periksa delivery lalu retry yang gagal.`);
  redirectWithError(examId, campaignId, `Penjadwalan gagal untuk ${failedCount} email.`);
}

export async function sendCampaignTestEmail(examId: string, campaignId: string, formData: FormData) {
  const { organizationId } = await requireAdminWriteAccess();
  const testEmail = String(formData.get("test_email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(testEmail)) redirectWithError(examId, campaignId, "Email tujuan test tidak valid.");

  const { exam, campaign, organization, resend, from, replyTo } = await prepareSendContext(examId, campaignId, organizationId);
  if (campaign.status !== "DRAFT") redirectWithError(examId, campaignId, "Test email hanya tersedia saat campaign masih DRAFT.");

  // Test email tidak memakai PII/credential peserta sungguhan.
  // Semua nilai peserta dibuat sintetis agar aman dikirim ke tester mana pun.
  const origin = await getPublicAppOrigin();
  const participantLink = `${origin}/join/${examId}`;
  const variables = {
    ...baseVariables({
      candidate: { display_name: "Peserta Contoh", candidate_code: "DEMO-001" },
      exam: {
        title: String(exam.title),
        login_open_at: exam.login_open_at,
        starts_at: exam.starts_at,
        hard_close_at: exam.hard_close_at,
        duration_minutes: Number(exam.duration_minutes),
      },
      organizationName: String(organization.name),
      participantLink,
    }),
    kode_akses: "ABCD-2345",
  };

  const subject = `[TEST] ${renderExamEmailTemplate(String(campaign.subject_template), variables)}`;
  const body = `${renderExamEmailTemplate(String(campaign.body_template), variables)}\n\n---\nEMAIL TEST: kode akses di atas adalah contoh dan tidak dapat dipakai login.`;
  const { data, error } = await resend.emails.send({
    from,
    ...(replyTo ? { replyTo } : {}),
    to: [testEmail],
    subject,
    text: body,
    html: buildParticipantEmailHtml({ organizationName: String(organization.name), examTitle: String(exam.title), bodyText: body, participantLink }),
  });
  if (error || !data?.id) redirectWithError(examId, campaignId, `Test email gagal: ${getResendErrorMessage(error)}`);
  redirectWithSuccess(examId, campaignId, `Test email dikirim ke ${testEmail}. Tidak ada status peserta yang berubah.`);
}

export async function retryFailedDeliveries(examId: string, campaignId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const { supabase, campaign } = await loadCore(examId, campaignId, organizationId);
  if (!["FAILED", "PARTIAL"].includes(String(campaign.status))) {
    redirectWithError(examId, campaignId, "Retry hanya tersedia untuk campaign FAILED atau PARTIAL.");
  }
  const settings = campaign.settings && typeof campaign.settings === "object" ? campaign.settings as Record<string, unknown> : {};
  if (settings.canceled_at) redirectWithError(examId, campaignId, "Campaign yang sudah dibatalkan tidak dapat di-retry. Buat campaign baru.");
  if (campaign.send_mode === "SCHEDULED" && (!campaign.scheduled_at || new Date(String(campaign.scheduled_at)).getTime() <= Date.now())) {
    redirectWithError(examId, campaignId, "Jadwal campaign sudah lewat. Buat campaign terjadwal baru.");
  }

  // Hanya retry kegagalan yang provider belum pernah menerima (tanpa message id).
  // Bounce/suppression setelah provider menerima tidak diulang otomatis agar reputasi domain aman.
  const { data: retryable, error: readError } = await supabase
    .from("exam_email_deliveries")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("organization_id", organizationId)
    .eq("status", "FAILED")
    .is("provider_message_id", null);
  if (readError) throw new Error("Gagal membaca delivery gagal.");
  if (!retryable?.length) redirectWithError(examId, campaignId, "Tidak ada delivery gagal yang aman untuk di-retry otomatis.");

  const now = new Date().toISOString();
  const { error: resetError } = await supabase
    .from("exam_email_deliveries")
    .update({ status: "PENDING", processing_at: null, next_attempt_at: null, failed_at: null, last_error: null, updated_at: now })
    .in("id", retryable.map((row) => row.id));
  if (resetError) throw new Error("Delivery gagal tidak dapat di-reset.");

  await supabase
    .from("exam_email_campaigns")
    .update({ status: "DRAFT", updated_at: now })
    .eq("id", campaignId)
    .eq("organization_id", organizationId);

  refreshCampaign(examId, campaignId);
  redirectWithSuccess(examId, campaignId, `${retryable.length} delivery gagal dikembalikan ke PENDING. Periksa lalu kirim/jadwalkan ulang.`);
}

export async function cancelScheduledCampaign(examId: string, campaignId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const { supabase, campaign } = await loadCore(examId, campaignId, organizationId);
  if (!["SCHEDULED", "PARTIAL", "DRAFT"].includes(String(campaign.status))) {
    redirectWithError(examId, campaignId, "Tidak ada campaign terjadwal yang dapat dibatalkan.");
  }

  let resend: ReturnType<typeof getResendClient>;
  try {
    resend = getResendClient();
  } catch (error) {
    redirectWithError(examId, campaignId, error instanceof Error ? error.message : "Resend belum dikonfigurasi.");
  }

  const { data: scheduled, error: readError } = await supabase
    .from("exam_email_deliveries")
    .select("id, provider_message_id")
    .eq("campaign_id", campaignId)
    .eq("organization_id", organizationId)
    .eq("status", "SCHEDULED");
  if (readError) throw new Error("Gagal membaca email terjadwal.");
  if (!scheduled?.length) redirectWithError(examId, campaignId, "Tidak ada delivery SCHEDULED yang dapat dibatalkan.");

  let canceledCount = 0;
  let failedCount = 0;
  const now = new Date().toISOString();
  for (const delivery of scheduled) {
    if (!delivery.provider_message_id) {
      failedCount += 1;
      continue;
    }
    try {
      const { error } = await resend.emails.cancel(String(delivery.provider_message_id));
      if (error) throw new Error(getResendErrorMessage(error));
      await supabase
        .from("exam_email_deliveries")
        .update({ status: "FAILED", last_error: "DIBATALKAN ADMIN sebelum jadwal pengiriman.", failed_at: now, next_attempt_at: null, updated_at: now })
        .eq("id", delivery.id);
      canceledCount += 1;
    } catch (error) {
      console.error("RESEND CANCEL ERROR:", error);
      failedCount += 1;
    }
  }

  const currentSettings = campaign.settings && typeof campaign.settings === "object" ? campaign.settings as Record<string, unknown> : {};
  await supabase
    .from("exam_email_campaigns")
    .update({
      status: failedCount ? "PARTIAL" : "FAILED",
      settings: { ...currentSettings, canceled_at: now, canceled_count: canceledCount },
      updated_at: now,
    })
    .eq("id", campaignId)
    .eq("organization_id", organizationId);

  refreshCampaign(examId, campaignId);
  if (failedCount) redirectWithError(examId, campaignId, `${canceledCount} jadwal dibatalkan, tetapi ${failedCount} tidak dapat dibatalkan. Jalankan Sinkronkan Status Resend.`);
  redirectWithSuccess(examId, campaignId, `${canceledCount} email terjadwal berhasil dibatalkan.`);
}

export async function syncCampaignProviderStatus(examId: string, campaignId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const { supabase, campaign } = await loadCore(examId, campaignId, organizationId);
  const campaignSettings = campaign.settings && typeof campaign.settings === "object" ? campaign.settings as Record<string, unknown> : {};
  const campaignCanceled = Boolean(campaignSettings.canceled_at);
  let resend: ReturnType<typeof getResendClient>;
  try {
    resend = getResendClient();
  } catch (error) {
    redirectWithError(examId, campaignId, error instanceof Error ? error.message : "Resend belum dikonfigurasi.");
  }

  const { data: deliveries, error: readError } = await supabase
    .from("exam_email_deliveries")
    .select("id, status, provider_message_id, sent_at, last_error")
    .eq("campaign_id", campaignId)
    .eq("organization_id", organizationId)
    .not("provider_message_id", "is", null);
  if (readError) throw new Error("Gagal membaca delivery provider.");
  if (!deliveries?.length) redirectWithError(examId, campaignId, "Belum ada delivery yang memiliki Provider Message ID.");

  let updated = 0;
  let providerErrors = 0;
  const failureEvents = new Set(["bounced", "failed", "suppressed", "complained"]);
  const sentEvents = new Set(["sent", "delivered", "opened", "clicked", "delivery_delayed"]);

  for (const delivery of deliveries) {
    try {
      const { data, error } = await resend.emails.get(String(delivery.provider_message_id));
      if (error || !data) throw new Error(getResendErrorMessage(error));
      const lastEvent = String(data.last_event ?? "").toLowerCase();
      const now = new Date().toISOString();

      if (failureEvents.has(lastEvent)) {
        await supabase
          .from("exam_email_deliveries")
          .update({ status: "FAILED", last_error: `RESEND ${lastEvent.toUpperCase()}: email tidak berhasil diterima secara normal.`, failed_at: now, updated_at: now })
          .eq("id", delivery.id);
        updated += 1;
      } else if (sentEvents.has(lastEvent)) {
        await supabase
          .from("exam_email_deliveries")
          .update({ status: "SENT", last_error: null, sent_at: delivery.sent_at ?? now, failed_at: null, updated_at: now })
          .eq("id", delivery.id);
        updated += 1;
      } else if (lastEvent === "scheduled" && delivery.status !== "SCHEDULED") {
        const locallyCanceled = campaignCanceled && String(delivery.last_error ?? "").startsWith("DIBATALKAN ADMIN");
        if (!locallyCanceled) {
          await supabase
            .from("exam_email_deliveries")
            .update({ status: "SCHEDULED", last_error: null, updated_at: now })
            .eq("id", delivery.id);
          updated += 1;
        }
      }
    } catch (error) {
      console.error("RESEND STATUS SYNC ERROR:", error);
      providerErrors += 1;
    }
  }

  const { data: rows } = await supabase
    .from("exam_email_deliveries")
    .select("status")
    .eq("campaign_id", campaignId)
    .eq("organization_id", organizationId);
  const statuses = (rows ?? []).map((row) => String(row.status));
  const allSent = statuses.length > 0 && statuses.every((status) => status === "SENT");
  const allFailed = statuses.length > 0 && statuses.every((status) => status === "FAILED");
  const hasFailed = statuses.some((status) => status === "FAILED");
  const hasScheduled = statuses.some((status) => status === "SCHEDULED");
  const hasSent = statuses.some((status) => status === "SENT");
  const nextStatus = campaignCanceled
    ? ((hasSent || hasScheduled) ? "PARTIAL" : "FAILED")
    : allSent
      ? "SENT"
      : allFailed
        ? "FAILED"
        : hasFailed && (hasSent || hasScheduled)
          ? "PARTIAL"
          : hasScheduled
            ? "SCHEDULED"
            : String(campaign.status);

  await supabase
    .from("exam_email_campaigns")
    .update({ status: nextStatus, sent_at: allSent ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("organization_id", organizationId);

  refreshCampaign(examId, campaignId);
  const suffix = providerErrors ? ` ${providerErrors} status provider gagal dibaca.` : "";
  redirectWithSuccess(examId, campaignId, `Status Resend disinkronkan. ${updated} delivery diperbarui.${suffix}`);
}
