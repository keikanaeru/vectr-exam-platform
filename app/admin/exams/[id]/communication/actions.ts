"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminWriteAccess } from "@/lib/organization-subscription";
import { databaseErrorMessage, logDatabaseError } from "@/lib/db-error";
import { templateUsesAccessCode, validateExamEmailTemplates } from "@/lib/exam-email";


// =====================================
// REDIRECT HELPERS
// =====================================

function redirectWithError(
  examId: string,
  message: string
): never {
  redirect(
    `/admin/exams/${examId}/communication?error=${encodeURIComponent(
      message
    )}`
  );
}


function redirectWithSuccess(
  examId: string,
  message: string
): never {
  redirect(
    `/admin/exams/${examId}/communication?success=${encodeURIComponent(
      message
    )}`
  );
}


// =====================================
// WIB DATETIME-LOCAL → ISO
// =====================================

function wibToIso(
  raw: string
) {
  const value =
    raw.trim();


  if (!value) {
    return null;
  }


  const normalized =
    value.length === 16
      ? `${value}:00+07:00`
      : `${value}+07:00`;


  const date =
    new Date(
      normalized
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }


  return date.toISOString();
}


// =====================================
// SAVE EMAIL CAMPAIGN
// =====================================

export async function saveEmailCampaign(
  examId: string,
  formData: FormData
) {
  // =====================================
  // ORGANIZATION
  // =====================================

  const {
    organizationId,
    context,
  } =
    await requireAdminWriteAccess();


  const supabase =
    createAdminClient();


  const userId = context.userId;


  // =====================================
  // INPUT
  // =====================================

  const name =
    String(
      formData.get(
        "name"
      ) || ""
    ).trim();


  const subjectTemplate =
    String(
      formData.get(
        "subject_template"
      ) || ""
    ).trim();


  const bodyTemplate =
    String(
      formData.get(
        "body_template"
      ) || ""
    ).trim();


  const sendMode =
    String(
      formData.get(
        "send_mode"
      ) || "NOW"
    )
      .trim()
      .toUpperCase();


  const scheduledRaw =
    String(
      formData.get(
        "scheduled_at"
      ) || ""
    ).trim();


  // =====================================
  // BASIC VALIDATION
  // =====================================

  if (!name) {
    redirectWithError(
      examId,
      "Nama campaign wajib diisi."
    );
  }


  if (!subjectTemplate) {
    redirectWithError(
      examId,
      "Subject email wajib diisi."
    );
  }


  if (!bodyTemplate) {
    redirectWithError(
      examId,
      "Isi email wajib diisi."
    );
  }


  if (name.length > 120) {
    redirectWithError(examId, "Nama campaign maksimal 120 karakter.");
  }


  try {
    validateExamEmailTemplates(subjectTemplate, bodyTemplate);
  } catch (error) {
    redirectWithError(examId, error instanceof Error ? error.message : "Template email tidak valid.");
  }


  if (
    sendMode !== "NOW" &&
    sendMode !== "SCHEDULED"
  ) {
    redirectWithError(
      examId,
      "Mode pengiriman email tidak valid."
    );
  }


  // =====================================
  // SCHEDULE VALIDATION
  // =====================================

  let scheduledAt:
    string | null =
    null;


  if (
    sendMode ===
    "SCHEDULED"
  ) {
    scheduledAt =
      wibToIso(
        scheduledRaw
      );


    if (!scheduledAt) {
      redirectWithError(
        examId,
        "Tanggal dan jam pengiriman wajib diisi untuk email terjadwal."
      );
    }


    const scheduledMs =
      new Date(
        scheduledAt
      ).getTime();


    if (
      scheduledMs <=
      Date.now()
    ) {
      redirectWithError(
        examId,
        "Waktu pengiriman harus berada di masa mendatang."
      );
    }


    // ===================================
    // BATAS AMAN SCHEDULER
    //
    // Untuk sekarang kita batasi 30 hari.
    // ===================================

    const thirtyDaysMs =
      30 *
      24 *
      60 *
      60 *
      1000;


    if (
      scheduledMs >
      Date.now() +
        thirtyDaysMs
    ) {
      redirectWithError(
        examId,
        "Jadwal pengiriman maksimal 30 hari dari sekarang."
      );
    }
  }


  // =====================================
  // VALIDATE EXAM
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
        batch_id,
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
      "EMAIL CAMPAIGN EXAM VALIDATION ERROR:",
      examError
    );

    throw new Error(
      "Gagal memvalidasi ujian."
    );
  }


  if (!exam) {
    redirectWithError(
      examId,
      "Ujian tidak ditemukan pada organisasi aktif."
    );
  }


  // =====================================
  // CHECK BATCH CANDIDATES
  // =====================================

  const {
    data: candidates,
    error: candidatesError,
  } =
    await supabase
      .from("candidates")
      .select(
        `
        id,
        email
        `
      )
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "batch_id",
        exam.batch_id
      )
      .eq(
        "active",
        true
      );


  if (candidatesError) {
    console.error(
      "EMAIL CAMPAIGN CANDIDATES ERROR:",
      candidatesError
    );

    throw new Error(
      "Gagal membaca peserta ujian."
    );
  }


  const candidateIdsWithEmail =
    (
      candidates ??
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
        ) =>
          candidate.id
      );


  if (
    candidateIdsWithEmail.length ===
    0
  ) {
    redirectWithError(
      examId,
      "Tidak ada peserta aktif yang memiliki alamat email."
    );
  }


  // =====================================
  // CHECK EXAM ASSIGNMENTS
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
      )
      .in(
        "candidate_id",
        candidateIdsWithEmail
      );


  if (assignmentsError) {
    console.error(
      "EMAIL CAMPAIGN ASSIGNMENTS ERROR:",
      assignmentsError
    );

    throw new Error(
      "Gagal membaca peserta yang terdaftar pada ujian."
    );
  }


  const recipientCount =
    (
      assignments ??
      []
    ).length;


  if (
    recipientCount ===
    0
  ) {
    redirectWithError(
      examId,
      "Tidak ada peserta ujian yang memiliki alamat email."
    );
  }


  // =====================================
  // CREATE CAMPAIGN
  //
  // PENTING:
  //
  // NOW       → DRAFT
  // SCHEDULED → DRAFT
  //
  // Status baru menjadi SCHEDULED
  // SETELAH request scheduling ke
  // provider email berhasil.
  // =====================================

  const {
    data: campaign,
    error: campaignError,
  } =
    await supabase
      .from(
        "exam_email_campaigns"
      )
      .insert({
        organization_id:
          organizationId,

        exam_id:
          examId,

        created_by:
          userId,

        name,

        subject_template:
          subjectTemplate,

        body_template:
          bodyTemplate,

        send_mode:
          sendMode,

        scheduled_at:
          scheduledAt,

        status:
          "DRAFT",

        settings: {
          recipient_count:
            recipientCount,
          credential_in_template:
            templateUsesAccessCode(subjectTemplate, bodyTemplate),
        },
      })
      .select(
        "id"
      )
      .single();


  if (
    campaignError ||
    !campaign
  ) {
    logDatabaseError(
      "EMAIL_CAMPAIGN_CREATE",
      campaignError
    );

    throw new Error(
      databaseErrorMessage(
        "EMAIL_CAMPAIGN_CREATE",
        "Gagal menyimpan campaign email.",
        campaignError
      )
    );
  }


  // =====================================
  // REFRESH
  // =====================================

  revalidatePath(
    `/admin/exams/${examId}/communication`
  );


  revalidatePath(
    "/admin/exams"
  );


  // =====================================
  // SUCCESS
  // =====================================

  if (
    sendMode ===
    "SCHEDULED"
  ) {
    redirectWithSuccess(
      examId,
      `Draft email terjadwal berhasil disimpan untuk ${recipientCount} peserta. Jadwal belum dikirim ke provider.`
    );
  }


  redirectWithSuccess(
    examId,
    `Draft email berhasil disimpan untuk ${recipientCount} peserta.`
  );
}