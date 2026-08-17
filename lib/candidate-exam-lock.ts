import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type ActiveExamCandidateLock = {
  id: string;
  title: string;
};

/**
 * Returns an ACTIVE exam for which this candidate still has an active
 * assignment. Identity keys and batch membership must not move underneath a
 * live exam: reconnect/login, credential delivery, and proctor history all
 * depend on that assignment remaining stable.
 */
export async function getActiveExamUsingCandidate(
  supabase: AdminClient,
  organizationId: string,
  candidateId: string
): Promise<ActiveExamCandidateLock | null> {
  const { data: assignments, error: assignmentError } = await supabase
    .from("exam_assignments")
    .select("exam_id")
    .eq("candidate_id", candidateId)
    .eq("active", true);

  if (assignmentError) {
    throw new Error(`Gagal memeriksa assignment peserta pada ujian aktif: ${assignmentError.message}`);
  }

  const examIds = [...new Set((assignments ?? []).map((row) => String(row.exam_id)).filter(Boolean))];
  if (!examIds.length) return null;

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, title")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .in("id", examIds)
    .limit(1)
    .maybeSingle();

  if (examError) {
    throw new Error(`Gagal memeriksa status ujian peserta: ${examError.message}`);
  }

  return exam
    ? { id: String(exam.id), title: String(exam.title ?? "Ujian aktif") }
    : null;
}

export function activeExamCandidateIdentityLockMessage(lock: ActiveExamCandidateLock) {
  return `Kode peserta dan batch dikunci karena peserta terhubung ke ujian ACTIVE “${lock.title}”. Nama, NIK/NIM, dan email masih boleh diperbaiki, tetapi identitas login atau batch baru boleh diubah setelah ujian ditutup.`;
}

export function activeExamCandidateStatusLockMessage(lock: ActiveExamCandidateLock) {
  return `Status aktif peserta dikunci karena peserta terhubung ke ujian ACTIVE “${lock.title}”. Gunakan kontrol sesi/proctor untuk penanganan peserta selama ujian; ubah status master peserta setelah ujian ditutup.`;
}
