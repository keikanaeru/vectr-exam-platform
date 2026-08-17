import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type ActiveExamModuleLock = {
  id: string;
  title: string;
};

/**
 * Returns an ACTIVE exam that currently uses the module, either through the
 * legacy exams.module_id bootstrap field or through the R6 exam_sections table.
 * Question/module content must stay immutable while an exam is ACTIVE so that
 * participants starting at different times receive the same bank snapshot.
 */
export async function getActiveExamUsingModule(
  supabase: AdminClient,
  organizationId: string,
  moduleId: string
): Promise<ActiveExamModuleLock | null> {
  const { data: legacy, error: legacyError } = await supabase
    .from("exams")
    .select("id, title")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .eq("module_id", moduleId)
    .limit(1)
    .maybeSingle();

  if (legacyError) {
    throw new Error(`Gagal memeriksa pemakaian modul pada ujian aktif: ${legacyError.message}`);
  }
  if (legacy) {
    return { id: String(legacy.id), title: String(legacy.title ?? "Ujian aktif") };
  }

  const { data: sectionRows, error: sectionError } = await supabase
    .from("exam_sections")
    .select("exam_id")
    .eq("module_id", moduleId);

  if (sectionError) {
    throw new Error(`Gagal memeriksa sesi modul pada ujian aktif: ${sectionError.message}`);
  }

  const examIds = [...new Set((sectionRows ?? []).map((row) => String(row.exam_id)).filter(Boolean))];
  if (!examIds.length) return null;

  const { data: active, error: activeError } = await supabase
    .from("exams")
    .select("id, title")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .in("id", examIds)
    .limit(1)
    .maybeSingle();

  if (activeError) {
    throw new Error(`Gagal memeriksa status ujian pemakai modul: ${activeError.message}`);
  }

  return active
    ? { id: String(active.id), title: String(active.title ?? "Ujian aktif") }
    : null;
}

export function activeExamModuleLockMessage(lock: ActiveExamModuleLock) {
  return `Modul dikunci karena sedang dipakai ujian ACTIVE “${lock.title}”. Tutup ujian atau ubah status ujian terlebih dahulu agar bank soal tetap konsisten untuk semua peserta.`;
}
