"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { ensureScheduleWithinSubscription, requireAdminWriteAccess } from "@/lib/organization-subscription";
import { databaseErrorMessage } from "@/lib/db-error";
import {
  decryptAccessCode,
  encryptAccessCode,
  generateAccessCode,
  normalizeAccessCode,
} from "@/lib/access-code-crypto";

const BCRYPT_COST = 10;
const HASH_CONCURRENCY = 8;
const DATABASE_CONCURRENCY = 12;

type AssignmentRow = {
  id: string;
  access_code_hash: string | null;
  access_code_ciphertext: string | null;
  access_code_generated_at: string | null;
};


type ExamSectionInput = {
  moduleId: string;
  durationMinutes: number;
};

function parseExamSectionInputs(formData: FormData): ExamSectionInput[] {
  const moduleIds = formData.getAll("section_module_id").map((value) => String(value).trim()).filter(Boolean);
  const durations = formData.getAll("section_duration_minutes").map((value) => Number(value));

  if (moduleIds.length === 0) {
    const legacyModuleId = String(formData.get("module_id") ?? "").trim();
    const legacyDuration = Number(formData.get("duration_minutes") ?? 0);
    return legacyModuleId ? [{ moduleId: legacyModuleId, durationMinutes: legacyDuration }] : [];
  }

  if (moduleIds.length !== durations.length) {
    redirectWithError("Konfigurasi sesi modul tidak lengkap.");
  }
  if (moduleIds.length > 10) {
    redirectWithError("Maksimal 10 sesi modul dalam satu ujian.");
  }
  if (new Set(moduleIds).size !== moduleIds.length) {
    redirectWithError("Satu modul tidak boleh dipakai dua kali dalam ujian yang sama.");
  }

  return moduleIds.map((moduleId, index) => {
    const durationMinutes = durations[index];
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440) {
      redirectWithError(`Batas waktu sesi ${index + 1} harus 1–1440 menit.`);
    }
    return { moduleId, durationMinutes };
  });
}

function validateSectionDurationBudget(sections: ExamSectionInput[], totalDurationMinutes: number) {
  const sectionTotal = sections.reduce((sum, section) => sum + section.durationMinutes, 0);
  if (sectionTotal > totalDurationMinutes) {
    redirectWithError(
      `Total batas sesi modul ${sectionTotal} menit melebihi Durasi Total Ujian ${totalDurationMinutes} menit. Naikkan durasi total atau kurangi batas sesi.`
    );
  }
}

async function validateExamSectionModules(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
  sections: ExamSectionInput[],
  requireActive = false
) {
  if (!sections.length) redirectWithError("Pilih minimal satu modul untuk ujian.");
  const ids = sections.map((section) => section.moduleId);
  const { data, error } = await supabase
    .from("modules")
    .select("id, code, name, status")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) throw new Error("Gagal memvalidasi sesi modul ujian.");
  const moduleMap = new Map((data ?? []).map((row) => [String(row.id), row]));
  for (const [index, section] of sections.entries()) {
    const sectionModule = moduleMap.get(section.moduleId);
    if (!sectionModule) redirectWithError(`Modul sesi ${index + 1} tidak ditemukan pada organisasi aktif.`);
    if (String(sectionModule.status) === "INACTIVE") redirectWithError(`Modul ${sectionModule.name} sedang nonaktif.`);
    if (requireActive && String(sectionModule.status) !== "ACTIVE") redirectWithError(`Modul ${sectionModule.name} belum ACTIVE. Aktifkan semua modul sebelum mengaktifkan ujian.`);
  }
  return moduleMap;
}

type PreparedCredential = {
  assignment: AssignmentRow;
  code: string;
  hash: string;
  ciphertext: string;
  generatedAt: string;
};

function redirectWithError(message: string): never {
  redirect(`/admin/exams?error=${encodeURIComponent(message)}`);
}

function redirectWithSuccess(message: string): never {
  redirect(`/admin/exams?success=${encodeURIComponent(message)}`);
}

function wibToIso(raw: string) {
  const value = raw.trim();

  if (!value) {
    return null;
  }

  const normalized =
    value.length === 16
      ? `${value}:00+07:00`
      : `${value}+07:00`;

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  );

  return results;
}

async function syncExamParticipantsInternal(
  examId: string,
  organizationId: string,
  supabase: ReturnType<typeof createAdminClient>
) {
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, batch_id, title, status")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (examError || !exam) {
    throw new Error("Ujian tidak ditemukan pada organisasi aktif.");
  }

  const { data: candidates, error: candidatesError } = await supabase
    .from("candidates")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("batch_id", exam.batch_id)
    .eq("active", true);

  if (candidatesError) {
    throw new Error("Gagal membaca peserta aktif pada batch ujian.");
  }

  const { data: currentAssignments, error: assignmentsError } = await supabase
    .from("exam_assignments")
    .select("id, candidate_id, active")
    .eq("exam_id", examId);

  if (assignmentsError) {
    throw new Error("Gagal membaca assignment peserta ujian.");
  }

  const assignmentByCandidate = new Map(
    (currentAssignments ?? []).map((row) => [String(row.candidate_id), row])
  );

  const activeCandidateIds = new Set((candidates ?? []).map((candidate) => String(candidate.id)));

  const toReactivate = (currentAssignments ?? []).filter(
    (row) => activeCandidateIds.has(String(row.candidate_id)) && !Boolean(row.active)
  );

  const toDeactivate = ["DRAFT", "ACTIVE"].includes(String(exam.status))
    ? (currentAssignments ?? []).filter(
        (row) => !activeCandidateIds.has(String(row.candidate_id)) && Boolean(row.active)
      )
    : [];

  if (toDeactivate.length > 0) {
    const { error: deactivateError } = await supabase
      .from("exam_assignments")
      .update({ active: false })
      .in("id", toDeactivate.map((row) => row.id));
    if (deactivateError) {
      throw new Error("Assignment peserta yang sudah tidak aktif gagal dinonaktifkan.");
    }
  }

  if (toReactivate.length > 0) {
    const { error: reactivateError } = await supabase
      .from("exam_assignments")
      .update({ active: true })
      .in("id", toReactivate.map((row) => row.id));
    if (reactivateError) {
      throw new Error("Assignment peserta lama gagal diaktifkan kembali.");
    }
  }

  const missing = (candidates ?? []).filter(
    (candidate) => !assignmentByCandidate.has(String(candidate.id))
  );

  if (missing.length > 0) {
    const rows = missing.map((candidate) => ({
      exam_id: examId,
      candidate_id: candidate.id,
      extra_time_minutes: 0,
      active: true,
    }));

    let { error: insertError } = await supabase
      .from("exam_assignments")
      .upsert(rows, {
        onConflict: "exam_id,candidate_id",
        ignoreDuplicates: true,
      });

    // Database V2 lama mungkin belum punya unique(exam_id,candidate_id).
    // FINAL_SETUP R5 memperbaiki kontrak ini; fallback menjaga sync tetap idempotent sebisa mungkin.
    if (insertError?.code === "42P10") {
      const fallback = await supabase.from("exam_assignments").insert(rows);
      insertError = fallback.error;
    }

    if (insertError && insertError.code !== "23505") {
      console.error("SYNC EXAM PARTICIPANTS ERROR:", insertError);
      throw new Error(
        databaseErrorMessage(
          "EXAM_ASSIGNMENT_SYNC",
          "Peserta baru gagal disinkronkan ke ujian.",
          insertError
        )
      );
    }
  }

  return {
    added: missing.length + toReactivate.length,
    totalBatch: (candidates ?? []).length,
    title: String(exam.title),
    status: String(exam.status),
  };
}

export async function syncExamParticipants(examId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  let result: Awaited<ReturnType<typeof syncExamParticipantsInternal>>;

  try {
    result = await syncExamParticipantsInternal(examId, organizationId, supabase);
  } catch (error) {
    console.error("SYNC EXAM PARTICIPANTS ACTION ERROR:", error);
    redirectWithError(
      error instanceof Error
        ? error.message
        : "Peserta ujian gagal disinkronkan. Silakan coba kembali."
    );
  }

  revalidatePath("/admin/exams");
  revalidatePath(`/join/${examId}`);

  // ACTIVE exam: satu klik = sync assignment + generate credential yang masih missing.
  // generateExamAccessCodes melakukan sync ulang secara idempotent lalu hanya mengisi
  // assignment yang belum mempunyai hash/ciphertext, jadi credential lama tidak berubah.
  if (result.status === "ACTIVE") {
    return generateExamAccessCodes(examId);
  }

  redirectWithSuccess(
    result.added > 0
      ? `${result.added} peserta berhasil disinkronkan ke ujian "${result.title}". Credential akan dibuat setelah ujian ACTIVE.`
      : `Peserta ujian "${result.title}" sudah sinkron dengan batch. Credential akan tersedia setelah ujian ACTIVE.`
  );
}

// =====================================
// BUAT UJIAN
// =====================================

export async function createExam(formData: FormData) {
  const { organizationId, context, subscription } =
    await requireAdminWriteAccess();

  const supabase = createAdminClient();
  const userId = context.userId;

  const title = String(
    formData.get("title") || ""
  ).trim();

  const sections = parseExamSectionInputs(formData);
  const moduleId = sections[0]?.moduleId ?? "";

  const batchId = String(
    formData.get("batch_id") || ""
  ).trim();

  const durationMinutes = Number(
    formData.get("duration_minutes") || 0
  );

  const loginOpenAt = wibToIso(
    String(formData.get("login_open_at") || "")
  );

  const startsAt = wibToIso(
    String(formData.get("starts_at") || "")
  );

  const hardCloseAt = wibToIso(
    String(formData.get("hard_close_at") || "")
  );

  if (!title) {
    redirectWithError("Judul ujian wajib diisi.");
  }

  if (!moduleId) {
    redirectWithError(
      "Pilih modul yang akan digunakan untuk ujian."
    );
  }

  if (!batchId) {
    redirectWithError(
      "Pilih batch peserta yang akan mengikuti ujian."
    );
  }

  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    redirectWithError(
      "Durasi ujian harus lebih dari 0 menit."
    );
  }

  if (!Number.isInteger(durationMinutes)) {
    redirectWithError(
      "Durasi ujian harus berupa angka menit bulat."
    );
  }

  validateSectionDurationBudget(sections, durationMinutes);

  if (!loginOpenAt || !startsAt || !hardCloseAt) {
    redirectWithError(
      "Jadwal ujian belum lengkap atau format tanggal dan jam tidak valid."
    );
  }

  const loginMs = new Date(loginOpenAt).getTime();
  const startMs = new Date(startsAt).getTime();
  const hardCloseMs = new Date(hardCloseAt).getTime();

  if (loginMs > startMs) {
    redirectWithError(
      "Jadwal tidak valid. Waktu Login Dibuka harus sama dengan atau lebih awal dari waktu Ujian Mulai."
    );
  }

  if (hardCloseMs <= startMs) {
    redirectWithError(
      "Jadwal tidak valid. Hard Close harus lebih akhir dari waktu Ujian Mulai."
    );
  }

  if (hardCloseMs <= Date.now()) {
    redirectWithError(
      "Hard Close harus berada di masa depan. Periksa kembali tanggal, tahun, dan jam WIB."
    );
  }

  if (!context.profile.isPlatformOwner) {
    try {
      ensureScheduleWithinSubscription(subscription, hardCloseMs, "Hard Close ujian");
    } catch (error) {
      redirectWithError(error instanceof Error ? error.message : "Jadwal ujian melewati masa aktif langganan.");
    }
  }

  await validateExamSectionModules(supabase, organizationId, sections);

  const {
    data: batch,
    error: batchError,
  } = await supabase
    .from("batches")
    .select("id, organization_id, status")
    .eq("id", batchId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (batchError) {
    console.error(
      "EXAM BATCH VALIDATION ERROR:",
      batchError
    );

    throw new Error(
      "Gagal memvalidasi batch ujian."
    );
  }

  if (!batch) {
    redirectWithError(
      "Batch yang dipilih tidak ditemukan pada organisasi aktif. Silakan pilih batch kembali."
    );
  }

  if (String(batch.status) !== "ACTIVE") {
    redirectWithError("Batch yang dipilih sedang nonaktif. Aktifkan batch atau pilih batch lain.");
  }

  const {
    data: candidates,
    error: candidatesError,
  } = await supabase
    .from("candidates")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("batch_id", batchId)
    .eq("active", true);

  if (candidatesError) {
    console.error(
      "EXAM CANDIDATES ERROR:",
      candidatesError
    );

    throw new Error(
      "Gagal membaca peserta pada batch."
    );
  }

  if (!candidates?.length) {
    redirectWithError(
      "Ujian belum bisa dibuat karena batch yang dipilih belum memiliki peserta aktif."
    );
  }

  const {
    data: exam,
    error: examError,
  } = await supabase
    .from("exams")
    .insert({
      organization_id: organizationId,
      module_id: moduleId,
      batch_id: batchId,
      title,
      login_open_at: loginOpenAt,
      starts_at: startsAt,
      hard_close_at: hardCloseAt,
      duration_minutes: durationMinutes,
      status: "DRAFT",
      settings: {},
      created_by: userId,
    })
    .select("id")
    .single();

  if (examError || !exam) {
    throw new Error(
      databaseErrorMessage("EXAM_CREATE", "Gagal membuat ujian. Silakan coba lagi.", examError)
    );
  }

  const { error: sectionInsertError } = await supabase.from("exam_sections").insert(
    sections.map((section, index) => ({
      exam_id: exam.id,
      module_id: section.moduleId,
      order_index: index + 1,
      duration_minutes: section.durationMinutes,
    }))
  );

  if (sectionInsertError) {
    await supabase.from("exams").delete().eq("id", exam.id).eq("organization_id", organizationId);
    throw new Error(databaseErrorMessage("EXAM_SECTION_CREATE", "Ujian gagal dibuat karena sesi modul tidak dapat disimpan.", sectionInsertError));
  }

  const assignments = candidates.map(
    (candidate) => ({
      exam_id: exam.id,
      candidate_id: candidate.id,
      extra_time_minutes: 0,
      active: true,
    })
  );

  const { error: assignmentError } =
    await supabase
      .from("exam_assignments")
      .insert(assignments);

  if (assignmentError) {
    console.error(
      "CREATE EXAM ASSIGNMENT ERROR:",
      assignmentError
    );

    await supabase
      .from("exams")
      .delete()
      .eq("id", exam.id)
      .eq("organization_id", organizationId);

    throw new Error(
      databaseErrorMessage("EXAM_ASSIGNMENT_CREATE", "Ujian gagal dibuat karena peserta tidak dapat didaftarkan.", assignmentError)
    );
  }

  revalidatePath("/admin/exams");
  revalidatePath("/admin");

  redirectWithSuccess(
    "Ujian berhasil dibuat sebagai DRAFT. Periksa kembali jadwal dan peserta sebelum mengaktifkan ujian."
  );
}

// =====================================
// AKTIFKAN UJIAN
// =====================================

export async function activateExam(
  examId: string
) {
  const { organizationId, context, subscription } =
    await requireAdminWriteAccess();

  const supabase = createAdminClient();

  const {
    data: exam,
    error: examError,
  } = await supabase
    .from("exams")
    .select(
      "id, module_id, batch_id, status, hard_close_at, duration_minutes, organization_id"
    )
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (examError) {
    console.error(
      "ACTIVATE EXAM VALIDATION ERROR:",
      examError
    );

    throw new Error(
      "Gagal memvalidasi ujian."
    );
  }

  if (!exam) {
    redirectWithError(
      "Ujian tidak ditemukan pada organisasi aktif."
    );
  }

  if (exam.status !== "DRAFT") {
    redirectWithError(
      "Ujian tidak dapat diaktifkan karena statusnya bukan DRAFT."
    );
  }

  const activationHardCloseMs = new Date(String(exam.hard_close_at)).getTime();
  if (activationHardCloseMs <= Date.now()) {
    redirectWithError(
      "Ujian tidak dapat diaktifkan karena Hard Close sudah lewat. Edit jadwal terlebih dahulu."
    );
  }
  if (!context.profile.isPlatformOwner) {
    try {
      ensureScheduleWithinSubscription(subscription, activationHardCloseMs, "Hard Close ujian");
    } catch (error) {
      redirectWithError(error instanceof Error ? error.message : "Jadwal ujian melewati masa aktif langganan.");
    }
  }

  await syncExamParticipantsInternal(examId, organizationId, createAdminClient());

  const { data: sectionRows, error: sectionReadError } = await supabase
    .from("exam_sections")
    .select("module_id, order_index, duration_minutes")
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });

  if (sectionReadError) throw new Error("Gagal membaca sesi modul ujian.");
  const activationSections: ExamSectionInput[] = sectionRows?.length
    ? sectionRows.map((row) => ({ moduleId: String(row.module_id), durationMinutes: Number(row.duration_minutes) }))
    : [{ moduleId: String(exam.module_id), durationMinutes: Number(exam.duration_minutes) || 1 }];
  validateSectionDurationBudget(activationSections, Number(exam.duration_minutes) || 1);
  const activeModules = await validateExamSectionModules(supabase, organizationId, activationSections, true);

  for (const section of activationSections) {
    const { count, error: questionError } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("module_id", section.moduleId)
      .eq("status", "ACTIVE");
    if (questionError) throw new Error("Gagal memeriksa soal sesi modul.");
    if (!count) {
      const sectionModule = activeModules.get(section.moduleId);
      redirectWithError(`Ujian belum bisa diaktifkan karena modul ${sectionModule?.name ?? section.moduleId} belum memiliki soal aktif.`);
    }
  }

  const { data: batchForActivation, error: activationBatchError } = await supabase
    .from("batches")
    .select("id, status")
    .eq("id", exam.batch_id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (activationBatchError || !batchForActivation) {
    redirectWithError("Ujian belum bisa diaktifkan karena batch tidak valid.");
  }

  if (String(batchForActivation.status) !== "ACTIVE") {
    redirectWithError("Ujian belum bisa diaktifkan karena batch peserta sedang nonaktif.");
  }

  const {
    count: assignmentCount,
    error: assignmentError,
  } = await supabase
    .from("exam_assignments")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("exam_id", examId)
    .eq("active", true);

  if (assignmentError) {
    console.error(
      "ACTIVATE ASSIGNMENT VALIDATION ERROR:",
      assignmentError
    );

    throw new Error(
      "Gagal memeriksa peserta ujian."
    );
  }

  if (!assignmentCount || assignmentCount < 1) {
    redirectWithError(
      "Ujian belum bisa diaktifkan karena belum memiliki peserta aktif."
    );
  }

  // If this draft has any remedial overrides, every active assignment must be
  // covered. Otherwise a forgotten participant would silently receive the
  // global module list, which is the exact ambiguity this feature removes.
  const { data: activeAssignmentsForRemedial, error: activeAssignmentsError } = await supabase
    .from("exam_assignments")
    .select("id")
    .eq("exam_id", examId)
    .eq("active", true);
  if (activeAssignmentsError) throw new Error("Gagal memeriksa assignment remedial peserta.");
  const activeAssignmentIds = (activeAssignmentsForRemedial ?? []).map((row) => String(row.id));
  const { data: remedialRows, error: remedialError } = activeAssignmentIds.length
    ? await supabase.from("exam_assignment_sections").select("assignment_id").in("assignment_id", activeAssignmentIds)
    : { data: [], error: null };
  if (remedialError && !["42P01", "PGRST205"].includes(remedialError.code ?? "")) {
    throw new Error("Gagal memeriksa konfigurasi modul remedial peserta.");
  }
  if (!remedialError && remedialRows?.length) {
    const covered = new Set(remedialRows.map((row) => String(row.assignment_id)));
    const uncovered = (activeAssignmentsForRemedial ?? []).filter((row) => !covered.has(String(row.id))).length;
    if (uncovered > 0) {
      redirectWithError(`Ujian belum bisa diaktifkan karena ${uncovered} peserta belum memiliki modul remedial. Buka menu Modul Remedial per Peserta.`);
    }
  }

  const { error: updateError } =
    await supabase
      .from("exams")
      .update({
        status: "ACTIVE",
      })
      .eq("id", examId)
      .eq("organization_id", organizationId);

  if (updateError) {
    redirectWithError(
      databaseErrorMessage(
        "EXAM_STATUS_ACTIVATE",
        "Gagal mengaktifkan ujian.",
        updateError
      )
    );
  }

  revalidatePath("/admin/exams");
  revalidatePath("/admin");
  revalidatePath(`/join/${examId}`);

  redirectWithSuccess(
    "Ujian berhasil diaktifkan."
  );
}

// =====================================
// TUTUP UJIAN
// =====================================

export async function closeExam(
  examId: string
) {
  const { organizationId } =
    await requireAdminWriteAccess();

  const supabase = createAdminClient();

  const {
    data: exam,
    error: examError,
  } = await supabase
    .from("exams")
    .select(
      "id, title, status, organization_id"
    )
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (examError) {
    console.error(
      "CLOSE EXAM VALIDATION ERROR:",
      examError
    );

    throw new Error(
      "Gagal memvalidasi ujian."
    );
  }

  if (!exam) {
    redirectWithError(
      "Ujian tidak ditemukan pada organisasi aktif."
    );
  }

  if (exam.status !== "ACTIVE") {
    if (exam.status === "CLOSED") {
      redirectWithError(
        "Ujian ini sudah berstatus CLOSED."
      );
    }

    redirectWithError(
      "Hanya ujian berstatus ACTIVE yang dapat ditutup."
    );
  }

  const {
    data: closedExam,
    error: updateError,
  } = await supabase
    .from("exams")
    .update({
      status: "CLOSED",
    })
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .select("id")
    .maybeSingle();

  if (updateError) {
    redirectWithError(
      databaseErrorMessage(
        "EXAM_STATUS_CLOSE",
        "Gagal menutup ujian.",
        updateError
      )
    );
  }

  if (!closedExam) {
    redirectWithError(
      "Ujian tidak dapat ditutup karena statusnya sudah berubah. Muat ulang halaman lalu coba kembali."
    );
  }

  revalidatePath("/admin/exams");
  revalidatePath("/admin");
  revalidatePath(`/join/${examId}`);

  redirectWithSuccess(
    `Ujian "${exam.title}" berhasil ditutup. Link peserta tidak lagi menerima login baru.`
  );
}

// =====================================
// GENERATE KODE AKSES UNIK
// =====================================

export async function generateExamAccessCodes(
  examId: string
) {
  const { organizationId } =
    await requireAdminWriteAccess();

  const supabase = createAdminClient();

  // =====================================
  // VALIDASI EXAM
  // =====================================

  const {
    data: exam,
    error: examError,
  } = await supabase
    .from("exams")
    .select(
      "id, title, status, organization_id"
    )
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (examError) {
    console.error(
      "GENERATE ACCESS CODE EXAM ERROR:",
      examError
    );

    throw new Error(
      "Gagal memvalidasi ujian."
    );
  }

  if (!exam) {
    redirectWithError(
      "Ujian tidak ditemukan pada organisasi aktif."
    );
  }

  if (exam.status !== "ACTIVE") {
    redirectWithError(
      "Kode akses hanya dapat dibuat setelah ujian berstatus ACTIVE."
    );
  }

  const syncResult = await syncExamParticipantsInternal(examId, organizationId, supabase);

  // =====================================
  // AMBIL ASSIGNMENT AKTIF
  // =====================================

  const {
    data: assignmentRows,
    error: assignmentError,
  } = await supabase
    .from("exam_assignments")
    .select(
      `
      id,
      access_code_hash,
      access_code_ciphertext,
      access_code_generated_at
      `
    )
    .eq("exam_id", examId)
    .eq("active", true)
    .order("assigned_at", {
      ascending: true,
    });

  if (assignmentError) {
    console.error(
      "GENERATE ACCESS CODE ASSIGNMENT ERROR:",
      assignmentError
    );

    throw new Error(
      "Gagal membaca peserta ujian."
    );
  }

  const assignments: AssignmentRow[] =
    (assignmentRows ?? []).map((row) => ({
      id: String(row.id),

      access_code_hash:
        row.access_code_hash
          ? String(row.access_code_hash)
          : null,

      access_code_ciphertext:
        row.access_code_ciphertext
          ? String(row.access_code_ciphertext)
          : null,

      access_code_generated_at:
        row.access_code_generated_at
          ? String(row.access_code_generated_at)
          : null,
    }));

  if (!assignments.length) {
    redirectWithError(
      "Kode akses belum dapat dibuat karena ujian tidak memiliki peserta aktif."
    );
  }

  // =====================================
  // JANGAN UBAH CREDENTIAL YANG SUDAH READY
  // =====================================

  const pendingAssignments =
    assignments.filter(
      (assignment) =>
        !assignment.access_code_hash ||
        !assignment.access_code_ciphertext
    );

  if (!pendingAssignments.length) {
    redirectWithSuccess(
      "Seluruh peserta aktif pada ujian ini sudah memiliki kode akses unik."
    );
  }

  // =====================================
  // KUMPULKAN KODE YANG SUDAH ADA
  // UNTUK MENCEGAH DUPLIKAT
  // =====================================

  const usedCodes = new Set<string>();

  try {
    for (const assignment of assignments) {
      if (!assignment.access_code_ciphertext) {
        continue;
      }

      const existingCode = normalizeAccessCode(
        decryptAccessCode(
          assignment.access_code_ciphertext
        )
      );

      usedCodes.add(existingCode);
    }
  } catch (error) {
    console.error(
      "READ EXISTING ACCESS CODE ERROR:",
      error
    );

    throw new Error(
      "Credential lama tidak dapat dibaca dengan encryption key saat ini. Jangan generate ulang sebelum encryption key diperiksa."
    );
  }

  // =====================================
  // GENERATE + HASH + ENCRYPT
  // =====================================

  const bcrypt =
    await import("bcryptjs");

  const generatedAt =
    new Date().toISOString();

  let preparedCredentials:
    PreparedCredential[];

  try {
    preparedCredentials =
      await mapWithConcurrency(
        pendingAssignments,
        HASH_CONCURRENCY,
        async (assignment) => {
          let code = "";

          do {
            code = normalizeAccessCode(
              generateAccessCode()
            );
          } while (usedCodes.has(code));

          usedCodes.add(code);

          const hash =
            await bcrypt.default.hash(
              code,
              BCRYPT_COST
            );

          const ciphertext =
            encryptAccessCode(code);

          return {
            assignment,
            code,
            hash,
            ciphertext,
            generatedAt,
          };
        }
      );
  } catch (error) {
    console.error(
      "PREPARE ACCESS CODE ERROR:",
      error
    );

    throw new Error(
      "Gagal menyiapkan kode akses peserta. Periksa konfigurasi ACCESS_CODE_ENCRYPTION_KEY."
    );
  }

  // =====================================
  // SIMPAN KE DATABASE
  // =====================================

  const updateResults =
    await mapWithConcurrency(
      preparedCredentials,
      DATABASE_CONCURRENCY,
      async (credential) => {
        const {
          data,
          error,
        } = await supabase
          .from("exam_assignments")
          .update({
            access_code_hash:
              credential.hash,

            access_code_ciphertext:
              credential.ciphertext,

            access_code_generated_at:
              credential.generatedAt,
          })
          .eq(
            "id",
            credential.assignment.id
          )
          .eq(
            "exam_id",
            examId
          )
          .eq(
            "active",
            true
          )
          .select("id")
          .maybeSingle();

        return {
          credential,
          success:
            !error &&
            Boolean(data),

          error,
        };
      }
    );

  const failedUpdates =
    updateResults.filter(
      (result) =>
        !result.success
    );

  // =====================================
  // ROLLBACK JIKA ADA YANG GAGAL
  // =====================================

  if (failedUpdates.length > 0) {
    console.error(
      "GENERATE ACCESS CODE UPDATE ERROR:",
      failedUpdates.map(
        (result) => ({
          assignmentId:
            result.credential.assignment.id,

          error:
            result.error,
        })
      )
    );

    const successfulUpdates =
      updateResults.filter(
        (result) =>
          result.success
      );

    const rollbackResults =
      await mapWithConcurrency(
        successfulUpdates,
        DATABASE_CONCURRENCY,
        async (result) => {
          const {
            error,
          } = await supabase
            .from("exam_assignments")
            .update({
              access_code_hash:
                result.credential.assignment
                  .access_code_hash,

              access_code_ciphertext:
                result.credential.assignment
                  .access_code_ciphertext,

              access_code_generated_at:
                result.credential.assignment
                  .access_code_generated_at,
            })
            .eq(
              "id",
              result.credential.assignment.id
            )
            .eq(
              "exam_id",
              examId
            );

          return error;
        }
      );

    const rollbackErrors =
      rollbackResults.filter(Boolean);

    if (rollbackErrors.length > 0) {
      console.error(
        "GENERATE ACCESS CODE ROLLBACK ERROR:",
        rollbackErrors
      );
    }

    throw new Error(
      "Sebagian kode akses gagal disimpan. Perubahan dibatalkan sebisa mungkin. Silakan coba kembali."
    );
  }

  // =====================================
  // REFRESH + SUCCESS
  // =====================================

  revalidatePath("/admin/exams");
  revalidatePath(`/join/${examId}`);

  redirectWithSuccess(
    `${preparedCredentials.length} kode akses unik berhasil dibuat untuk peserta ujian "${exam.title}"${syncResult.added ? `, termasuk ${syncResult.added} peserta baru yang disinkronkan` : ""}.`
  );
}

export async function updateExamSchedule(examId: string, formData: FormData) {
  const { organizationId, context, subscription } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const title = String(formData.get("title") ?? "").trim();
  const durationMinutes = Number(formData.get("duration_minutes") ?? 0);
  const loginOpenAt = wibToIso(String(formData.get("login_open_at") ?? ""));
  const startsAt = wibToIso(String(formData.get("starts_at") ?? ""));
  const hardCloseAt = wibToIso(String(formData.get("hard_close_at") ?? ""));
  const requestedSections = parseExamSectionInputs(formData);
  const requestedModuleId = requestedSections[0]?.moduleId ?? String(formData.get("module_id") ?? "").trim();
  const requestedBatchId = String(formData.get("batch_id") ?? "").trim();

  if (!title) redirectWithError("Judul ujian wajib diisi.");
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    redirectWithError("Durasi ujian harus berupa menit bulat lebih dari 0.");
  }
  if (!loginOpenAt || !startsAt || !hardCloseAt) {
    redirectWithError("Jadwal ujian belum lengkap atau tidak valid.");
  }

  const loginMs = new Date(loginOpenAt).getTime();
  const startMs = new Date(startsAt).getTime();
  const closeMs = new Date(hardCloseAt).getTime();
  if (loginMs > startMs) redirectWithError("Login Dibuka harus sama dengan atau lebih awal dari Ujian Mulai.");
  if (closeMs <= startMs) redirectWithError("Hard Close harus lebih akhir dari Ujian Mulai.");
  if (closeMs <= Date.now()) redirectWithError("Hard Close harus berada di masa depan.");
  if (!context.profile.isPlatformOwner) {
    try {
      ensureScheduleWithinSubscription(subscription, closeMs, "Hard Close ujian");
    } catch (error) {
      redirectWithError(error instanceof Error ? error.message : "Jadwal ujian melewati masa aktif langganan.");
    }
  }

  const { data: currentExam, error: currentError } = await supabase
    .from("exams")
    .select("id, module_id, batch_id, status, title, duration_minutes, login_open_at, starts_at, hard_close_at")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (currentError || !currentExam) redirectWithError("Ujian tidak ditemukan.");

  const { count: scheduledEmailCount, error: scheduledEmailError } = await supabase
    .from("exam_email_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId)
    .eq("organization_id", organizationId)
    .eq("status", "SCHEDULED");
  if (scheduledEmailError) redirectWithError("Gagal memeriksa email peserta yang terjadwal.");
  if ((scheduledEmailCount ?? 0) > 0) {
    redirectWithError("Konfigurasi ujian belum dapat diubah karena masih ada email peserta yang terjadwal di Resend. Buka Komunikasi, batalkan jadwal email, lalu edit ujian agar informasi yang terkirim tidak kedaluwarsa.");
  }

  const { data: existingSectionRows, error: existingSectionError } = await supabase
    .from("exam_sections")
    .select("module_id, order_index, duration_minutes")
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });
  if (existingSectionError) redirectWithError("Sesi modul ujian gagal dibaca.");

  // Durasi total harus selalu menampung seluruh batas sesi, termasuk saat ujian
  // ACTIVE ketika selector section tidak lagi dikirim oleh form.
  const effectiveBudgetSections: ExamSectionInput[] =
    currentExam.status === "DRAFT" && requestedSections.length
      ? requestedSections
      : existingSectionRows?.length
        ? existingSectionRows.map((row) => ({
            moduleId: String(row.module_id),
            durationMinutes: Number(row.duration_minutes),
          }))
        : [{
            moduleId: String(currentExam.module_id),
            durationMinutes: Number(currentExam.duration_minutes) || 1,
          }];
  validateSectionDurationBudget(effectiveBudgetSections, durationMinutes);

  const previousExamCore = {
    title: currentExam.title,
    module_id: currentExam.module_id,
    batch_id: currentExam.batch_id,
    duration_minutes: currentExam.duration_minutes,
    login_open_at: currentExam.login_open_at,
    starts_at: currentExam.starts_at,
    hard_close_at: currentExam.hard_close_at,
  };

  let moduleId = String(currentExam.module_id);
  let batchId = String(currentExam.batch_id);

  if (currentExam.status === "DRAFT") {
    if (requestedModuleId) moduleId = requestedModuleId;
    if (requestedBatchId) batchId = requestedBatchId;

    await validateExamSectionModules(
      supabase,
      organizationId,
      requestedSections.length ? requestedSections : [{ moduleId, durationMinutes }]
    );

    const batchResult = await supabase
      .from("batches")
      .select("id, status")
      .eq("id", batchId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (batchResult.error || !batchResult.data) redirectWithError("Batch baru tidak valid.");
    if (String(batchResult.data.status) !== "ACTIVE") redirectWithError("Batch baru sedang nonaktif.");
  }

  const batchChanged = batchId !== String(currentExam.batch_id);

  const { data, error } = await supabase
    .from("exams")
    .update({
      title,
      module_id: moduleId,
      batch_id: batchId,
      duration_minutes: durationMinutes,
      login_open_at: loginOpenAt,
      starts_at: startsAt,
      hard_close_at: hardCloseAt,
    })
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .select("id, status")
    .maybeSingle();

  if (error || !data) {
    redirectWithError(databaseErrorMessage("EXAM_UPDATE", "Konfigurasi ujian gagal diperbarui.", error));
  }

  if (currentExam.status === "DRAFT" && requestedSections.length) {
    const previousSections = existingSectionRows ?? [];

    const { error: deleteSectionError } = await supabase
      .from("exam_sections")
      .delete()
      .eq("exam_id", examId);

    if (deleteSectionError) {
      await supabase
        .from("exams")
        .update(previousExamCore)
        .eq("id", examId)
        .eq("organization_id", organizationId);
      redirectWithError(
        databaseErrorMessage(
          "EXAM_SECTION_RESET",
          "Sesi modul lama gagal diperbarui; perubahan ujian dibatalkan.",
          deleteSectionError
        )
      );
    }

    const nextRows = requestedSections.map((section, index) => ({
      exam_id: examId,
      module_id: section.moduleId,
      order_index: index + 1,
      duration_minutes: section.durationMinutes,
    }));

    const { error: insertSectionError } = await supabase.from("exam_sections").insert(nextRows);
    if (insertSectionError) {
      const restoreRows = previousSections.map((section) => ({
        exam_id: examId,
        module_id: section.module_id,
        order_index: section.order_index,
        duration_minutes: section.duration_minutes,
      }));
      if (restoreRows.length) {
        const { error: restoreError } = await supabase.from("exam_sections").insert(restoreRows);
        if (restoreError) console.error("EXAM SECTION ROLLBACK ERROR:", restoreError);
      }

      const { error: restoreExamError } = await supabase
        .from("exams")
        .update(previousExamCore)
        .eq("id", examId)
        .eq("organization_id", organizationId);
      if (restoreExamError) console.error("EXAM CORE ROLLBACK ERROR:", restoreExamError);

      redirectWithError(
        databaseErrorMessage(
          "EXAM_SECTION_UPDATE",
          "Sesi modul baru gagal disimpan; konfigurasi lama dipulihkan.",
          insertSectionError
        )
      );
    }
  }

  if (currentExam.status === "DRAFT" && batchChanged) {
    try {
      // Non-destruktif: peserta lama yang tak lagi ada di batch dinonaktifkan,
      // assignment yang masih relevan dipertahankan, peserta baru ditambahkan.
      await syncExamParticipantsInternal(examId, organizationId, supabase);
    } catch (syncError) {
      const { error: coreRollbackError } = await supabase
        .from("exams")
        .update(previousExamCore)
        .eq("id", examId)
        .eq("organization_id", organizationId);
      if (coreRollbackError) console.error("EXAM BATCH CORE ROLLBACK ERROR:", coreRollbackError);

      if (requestedSections.length) {
        const { error: sectionResetError } = await supabase
          .from("exam_sections")
          .delete()
          .eq("exam_id", examId);
        if (sectionResetError) {
          console.error("EXAM BATCH SECTION RESET ROLLBACK ERROR:", sectionResetError);
        } else {
          const restoreRows = (existingSectionRows ?? []).map((section) => ({
            exam_id: examId,
            module_id: section.module_id,
            order_index: section.order_index,
            duration_minutes: section.duration_minutes,
          }));
          if (restoreRows.length) {
            const { error: restoreSectionError } = await supabase
              .from("exam_sections")
              .insert(restoreRows);
            if (restoreSectionError) {
              console.error("EXAM BATCH SECTION ROLLBACK ERROR:", restoreSectionError);
            }
          }
        }
      }

      try {
        await syncExamParticipantsInternal(examId, organizationId, supabase);
      } catch (assignmentRollbackError) {
        console.error("EXAM BATCH ASSIGNMENT ROLLBACK ERROR:", assignmentRollbackError);
      }

      redirectWithError(
        databaseErrorMessage(
          "EXAM_ASSIGNMENT_SYNC",
          "Batch gagal diterapkan karena sinkronisasi peserta gagal; konfigurasi sebelumnya dipulihkan.",
          syncError
        )
      );
    }
  }

  revalidatePath("/admin/exams");
  revalidatePath(`/join/${examId}`);
  redirectWithSuccess(`Konfigurasi ujian "${title}" berhasil diperbarui.`);
}

export async function reopenExam(examId: string) {
  const { organizationId, context, subscription } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const { data: exam, error } = await supabase
    .from("exams")
    .select("id, title, status, hard_close_at")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !exam) redirectWithError("Ujian tidak ditemukan.");
  if (exam.status !== "CLOSED") redirectWithError("Hanya ujian CLOSED yang dapat dibuka kembali.");
  const reopenHardCloseMs = new Date(String(exam.hard_close_at)).getTime();
  if (reopenHardCloseMs <= Date.now()) {
    redirectWithError("Hard Close ujian sudah lewat. Edit jadwal ke waktu mendatang sebelum membuka kembali.");
  }
  if (!context.profile.isPlatformOwner) {
    try {
      ensureScheduleWithinSubscription(subscription, reopenHardCloseMs, "Hard Close ujian");
    } catch (error) {
      redirectWithError(error instanceof Error ? error.message : "Jadwal ujian melewati masa aktif langganan.");
    }
  }

  await syncExamParticipantsInternal(examId, organizationId, createAdminClient());

  const { error: updateError } = await supabase
    .from("exams")
    .update({ status: "ACTIVE" })
    .eq("id", examId)
    .eq("organization_id", organizationId);
  if (updateError) redirectWithError(databaseErrorMessage("EXAM_STATUS_REOPEN", "Ujian gagal dibuka kembali.", updateError));

  revalidatePath("/admin/exams");
  revalidatePath(`/join/${examId}`);
  redirectWithSuccess(`Ujian "${exam.title}" kembali ACTIVE.`);
}

export async function deleteExam(examId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const { data: exam, error } = await supabase
    .from("exams")
    .select("id, title, status")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !exam) redirectWithError("Ujian tidak ditemukan.");
  if (exam.status !== "DRAFT") redirectWithError("Hanya ujian DRAFT yang dapat dihapus. Ujian yang sudah memiliki riwayat sebaiknya ditutup, bukan dihapus.");

  const { data: assignmentRows, error: assignmentReadError } = await supabase
    .from("exam_assignments")
    .select("id")
    .eq("exam_id", examId);
  if (assignmentReadError) throw new Error("Gagal memeriksa assignment ujian.");

  const assignmentIds = (assignmentRows ?? []).map((row) => String(row.id));
  let sessionCount = 0;
  if (assignmentIds.length > 0) {
    const { count, error: sessionError } = await supabase
      .from("exam_sessions")
      .select("id", { count: "exact", head: true })
      .in("assignment_id", assignmentIds);
    if (sessionError) throw new Error("Gagal memeriksa histori sesi ujian.");
    sessionCount = count ?? 0;
  }

  if (sessionCount > 0) redirectWithError("Ujian sudah memiliki histori sesi dan tidak dapat dihapus.");

  const { error: assignmentDeleteError } = await supabase.from("exam_assignments").delete().eq("exam_id", examId);
  if (assignmentDeleteError) {
    redirectWithError(
      databaseErrorMessage(
        "EXAM_ASSIGNMENT_DELETE",
        "Assignment ujian draft gagal dihapus.",
        assignmentDeleteError
      )
    );
  }
  const { error: deleteError } = await supabase.from("exams").delete().eq("id", examId).eq("organization_id", organizationId);
  if (deleteError) redirectWithError(databaseErrorMessage("EXAM_DELETE", "Ujian gagal dihapus.", deleteError));

  revalidatePath("/admin/exams");
  redirectWithSuccess(`Ujian draft "${exam.title}" berhasil dihapus.`);
}
