"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminWriteAccess } from "@/lib/organization-subscription";
import { databaseErrorMessage } from "@/lib/db-error";
import {
  activeExamCandidateIdentityLockMessage,
  activeExamCandidateStatusLockMessage,
  getActiveExamUsingCandidate,
} from "@/lib/candidate-exam-lock";

function redirectWithError(message: string): never {
  redirect(`/admin/participants?error=${encodeURIComponent(message)}`);
}

function redirectWithSuccess(message: string): never {
  redirect(`/admin/participants?success=${encodeURIComponent(message)}`);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function refreshParticipants() {
  revalidatePath("/admin/participants");
  revalidatePath("/admin/participants/import");
  revalidatePath("/admin/exams");
  revalidatePath("/admin");
}

function refreshParticipantStatus() {
  revalidatePath("/admin/participants");
  revalidatePath("/admin/exams");
  revalidatePath("/admin");
}

async function ensureCandidateHasNoScheduledEmail(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
  candidateId: string
) {
  const { count, error } = await supabase
    .from("exam_email_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("candidate_id", candidateId)
    .eq("status", "SCHEDULED");

  if (error) {
    redirectWithError(
      databaseErrorMessage(
        "CANDIDATE_SCHEDULED_EMAIL_CHECK",
        "Gagal memeriksa email peserta yang terjadwal.",
        error
      )
    );
  }

  if ((count ?? 0) > 0) {
    redirectWithError(
      "Data peserta belum dapat diubah karena masih ada email terjadwal untuk peserta ini. Batalkan jadwal email di menu Ujian → Komunikasi terlebih dahulu agar nama, kode, atau alamat penerima tidak berbeda dari email yang sudah dijadwalkan."
    );
  }
}

async function runCandidateStatusGuards(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
  candidateId: string
) {
  // These reads are independent. Run them together, but preserve the old
  // error priority: a scheduled-email block is reported before an exam lock.
  const [emailCheck, activeExamCheck] = await Promise.allSettled([
    ensureCandidateHasNoScheduledEmail(supabase, organizationId, candidateId),
    getActiveExamUsingCandidate(supabase, organizationId, candidateId),
  ]);

  if (emailCheck.status === "rejected") {
    throw emailCheck.reason;
  }

  if (activeExamCheck.status === "rejected") {
    throw activeExamCheck.reason;
  }

  return activeExamCheck.value;
}

async function findCandidateDuplicate({
  organizationId,
  candidateCode,
  externalIdentifier,
  email,
  excludeCandidateId,
}: {
  organizationId: string;
  candidateCode: string;
  externalIdentifier: string | null;
  email: string | null;
  excludeCandidateId?: string;
}) {
  const supabase = createAdminClient();

  let query = supabase
    .from("candidates")
    .select("id, candidate_code, display_name, external_identifier, email, batch_id, active")
    .eq("organization_id", organizationId);

  if (excludeCandidateId) {
    query = query.neq("id", excludeCandidateId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("CHECK PARTICIPANT DUPLICATE ERROR:", error);
    throw new Error("Gagal memeriksa duplikat peserta.");
  }

  const normalizedExternal = externalIdentifier?.trim().toLowerCase() || null;
  const normalizedEmail = email?.trim().toLowerCase() || null;

  for (const candidate of data ?? []) {
    const existingCode = String(candidate.candidate_code ?? "").trim().toUpperCase();
    const existingExternal = candidate.external_identifier
      ? String(candidate.external_identifier).trim().toLowerCase()
      : null;
    const existingEmail = candidate.email
      ? String(candidate.email).trim().toLowerCase()
      : null;

    if (existingCode === candidateCode) {
      return {
        type: "code" as const,
        candidate,
      };
    }

    if (normalizedExternal && existingExternal === normalizedExternal) {
      return {
        type: "external_identifier" as const,
        candidate,
      };
    }

    if (normalizedEmail && existingEmail === normalizedEmail) {
      return {
        type: "email" as const,
        candidate,
      };
    }
  }

  return null;
}

function duplicateMessage(
  duplicate: NonNullable<Awaited<ReturnType<typeof findCandidateDuplicate>>>
) {
  const candidate = duplicate.candidate;
  const code = String(candidate.candidate_code);
  const name = String(candidate.display_name);

  if (duplicate.type === "code") {
    return `Kode peserta sudah digunakan oleh ${name} (${code}).`;
  }

  if (duplicate.type === "external_identifier") {
    return `NIK/NIM sudah digunakan oleh ${name} (${code}). Peserta yang sama tidak perlu dibuat dengan kode berbeda.`;
  }

  return `Email sudah digunakan oleh ${name} (${code}). Periksa apakah ini peserta yang sama.`;
}

export async function createBatch(formData: FormData) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const code = normalizeCode(String(formData.get("code") || ""));
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;

  if (!code || code.length < 2 || code.length > 50) {
    redirectWithError("Kode batch wajib diisi, 2–50 karakter.");
  }

  if (!name || name.length > 150) {
    redirectWithError("Nama batch wajib diisi, maksimal 150 karakter.");
  }

  const { data: existing, error: duplicateError } = await supabase
    .from("batches")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", code)
    .maybeSingle();

  if (duplicateError) {
    console.error("CHECK BATCH ERROR:", duplicateError);
    throw new Error("Gagal memeriksa kode batch.");
  }

  if (existing) {
    redirectWithError(`Kode batch ${code} sudah digunakan.`);
  }

  const { error } = await supabase.from("batches").insert({
    organization_id: organizationId,
    code,
    name,
    description,
    status: "ACTIVE",
  });

  if (error) {
    redirectWithError(databaseErrorMessage("BATCH_CREATE", "Batch gagal dibuat.", error));
  }

  refreshParticipants();
  redirectWithSuccess(`Batch ${name} berhasil dibuat.`);
}

export async function updateBatch(batchId: string, formData: FormData) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const code = normalizeCode(String(formData.get("code") || ""));
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const status = String(formData.get("status") || "ACTIVE").trim().toUpperCase();

  if (!code || !name) {
    redirectWithError("Kode dan nama batch wajib diisi.");
  }

  if (!["ACTIVE", "INACTIVE"].includes(status)) {
    redirectWithError("Status batch tidak valid.");
  }

  const { data: duplicate, error: duplicateError } = await supabase
    .from("batches")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", code)
    .neq("id", batchId)
    .maybeSingle();

  if (duplicateError) throw new Error("Gagal memeriksa kode batch.");
  if (duplicate) redirectWithError(`Kode batch ${code} sudah digunakan.`);

  const { data, error } = await supabase
    .from("batches")
    .update({ code, name, description, status })
    .eq("id", batchId)
    .eq("organization_id", organizationId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirectWithError(databaseErrorMessage("BATCH_UPDATE", "Batch gagal diperbarui.", error));
  }

  refreshParticipants();
  redirectWithSuccess(`Batch ${name} berhasil diperbarui.`);
}

export async function deleteBatch(batchId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const [candidateDependency, examDependency] = await Promise.all([
    supabase
      .from("candidates")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("batch_id", batchId),
    supabase
      .from("exams")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("batch_id", batchId),
  ]);

  if (candidateDependency.error || examDependency.error) {
    redirectWithError(
      databaseErrorMessage(
        "BATCH_DELETE_DEPENDENCY_CHECK",
        "Gagal memeriksa pemakaian batch sebelum penghapusan.",
        candidateDependency.error ?? examDependency.error
      )
    );
  }

  if ((candidateDependency.count ?? 0) > 0 || (examDependency.count ?? 0) > 0) {
    redirectWithError("Batch masih memiliki peserta atau ujian. Nonaktifkan batch jika ingin menyimpannya sebagai arsip.");
  }

  const { error } = await supabase
    .from("batches")
    .delete()
    .eq("id", batchId)
    .eq("organization_id", organizationId);

  if (error) {
    redirectWithError(databaseErrorMessage("BATCH_DELETE", "Batch gagal dihapus.", error));
  }

  refreshParticipants();
  redirectWithSuccess("Batch berhasil dihapus.");
}

export async function createCandidate(batchId: string, formData: FormData) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const { data: batch, error: batchError } = await supabase
    .from("batches")
    .select("id, name")
    .eq("id", batchId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (batchError || !batch) redirectWithError("Batch tidak ditemukan.");

  const candidateCode = normalizeCode(String(formData.get("candidate_code") || ""));
  const displayName = String(formData.get("display_name") || "").trim();
  const externalIdentifier = String(formData.get("external_identifier") || "").trim() || null;
  const emailRaw = String(formData.get("email") || "");
  const email = emailRaw.trim() ? normalizeEmail(emailRaw) : null;

  if (!candidateCode || candidateCode.length > 50) redirectWithError("Kode peserta wajib diisi, maksimal 50 karakter.");
  if (!displayName || displayName.length > 150) redirectWithError("Nama peserta wajib diisi, maksimal 150 karakter.");
  if (email && !isValidEmail(email)) redirectWithError("Format email peserta tidak valid.");

  const duplicate = await findCandidateDuplicate({
    organizationId,
    candidateCode,
    externalIdentifier,
    email,
  });

  if (duplicate) redirectWithError(duplicateMessage(duplicate));

  const { error } = await supabase.from("candidates").insert({
    organization_id: organizationId,
    batch_id: batchId,
    candidate_type: "INDIVIDUAL",
    candidate_code: candidateCode,
    display_name: displayName,
    external_identifier: externalIdentifier,
    email,
    active: true,
  });

  if (error) {
    redirectWithError(databaseErrorMessage("CANDIDATE_CREATE", "Peserta gagal ditambahkan.", error));
  }

  refreshParticipants();
  redirectWithSuccess(`${displayName} berhasil ditambahkan ke ${batch.name}.`);
}

export async function updateCandidate(candidateId: string, formData: FormData) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  await ensureCandidateHasNoScheduledEmail(supabase, organizationId, candidateId);

  const batchId = String(formData.get("batch_id") || "").trim();
  const candidateCode = normalizeCode(String(formData.get("candidate_code") || ""));
  const displayName = String(formData.get("display_name") || "").trim();
  const externalIdentifier = String(formData.get("external_identifier") || "").trim() || null;
  const emailRaw = String(formData.get("email") || "");
  const email = emailRaw.trim() ? normalizeEmail(emailRaw) : null;

  if (!batchId || !candidateCode || !displayName) {
    redirectWithError("Batch, kode, dan nama peserta wajib diisi.");
  }

  if (email && !isValidEmail(email)) redirectWithError("Format email peserta tidak valid.");

  const { data: currentCandidate, error: currentCandidateError } = await supabase
    .from("candidates")
    .select("id, batch_id, candidate_code")
    .eq("id", candidateId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (currentCandidateError || !currentCandidate) redirectWithError("Peserta tidak ditemukan.");

  const activeExamLock = await getActiveExamUsingCandidate(supabase, organizationId, candidateId);
  const identityMoves =
    String(currentCandidate.batch_id) !== batchId ||
    normalizeCode(String(currentCandidate.candidate_code ?? "")) !== candidateCode;
  if (activeExamLock && identityMoves) {
    redirectWithError(activeExamCandidateIdentityLockMessage(activeExamLock));
  }

  const { data: batch } = await supabase
    .from("batches")
    .select("id")
    .eq("id", batchId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!batch) redirectWithError("Batch tujuan tidak valid.");

  const duplicate = await findCandidateDuplicate({
    organizationId,
    candidateCode,
    externalIdentifier,
    email,
    excludeCandidateId: candidateId,
  });

  if (duplicate) redirectWithError(duplicateMessage(duplicate));

  const { data, error } = await supabase
    .from("candidates")
    .update({
      batch_id: batchId,
      candidate_code: candidateCode,
      display_name: displayName,
      external_identifier: externalIdentifier,
      email,
    })
    .eq("id", candidateId)
    .eq("organization_id", organizationId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirectWithError(databaseErrorMessage("CANDIDATE_UPDATE", "Data peserta gagal diperbarui.", error));
  }

  refreshParticipants();
  redirectWithSuccess(`${displayName} berhasil diperbarui.`);
}

export async function toggleCandidateActive(candidateId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const activeExamLock = await runCandidateStatusGuards(supabase, organizationId, candidateId);
  if (activeExamLock) redirectWithError(activeExamCandidateStatusLockMessage(activeExamLock));

  const { data: candidate, error } = await supabase
    .from("candidates")
    .select("id, display_name, active")
    .eq("id", candidateId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !candidate) redirectWithError("Peserta tidak ditemukan.");

  const next = !candidate.active;
  const { error: updateError } = await supabase
    .from("candidates")
    .update({ active: next })
    .eq("id", candidateId)
    .eq("organization_id", organizationId);

  if (updateError) redirectWithError(databaseErrorMessage("CANDIDATE_STATUS_UPDATE", "Status peserta gagal diubah.", updateError));

  refreshParticipantStatus();
  redirectWithSuccess(`${candidate.display_name} sekarang ${next ? "aktif" : "nonaktif"}.`);
}

export async function deleteCandidate(candidateId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, display_name")
    .eq("id", candidateId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!candidate) redirectWithError("Peserta tidak ditemukan.");

  const { count: assignmentCount, error: assignmentCountError } = await supabase
    .from("exam_assignments")
    .select("*", { count: "exact", head: true })
    .eq("candidate_id", candidateId);

  if (assignmentCountError) {
    redirectWithError(
      databaseErrorMessage(
        "CANDIDATE_DELETE_DEPENDENCY_CHECK",
        "Gagal memeriksa histori ujian peserta.",
        assignmentCountError
      )
    );
  }

  if ((assignmentCount ?? 0) > 0) {
    redirectWithError("Peserta sudah terhubung ke ujian. Nonaktifkan peserta untuk mempertahankan riwayat ujian.");
  }

  const { error } = await supabase
    .from("candidates")
    .delete()
    .eq("id", candidateId)
    .eq("organization_id", organizationId);

  if (error) {
    redirectWithError(databaseErrorMessage("CANDIDATE_DELETE", "Peserta gagal dihapus.", error));
  }

  refreshParticipants();
  redirectWithSuccess(`${candidate.display_name} berhasil dihapus.`);
}
