import { createAdminClient } from "@/lib/supabase/admin";

export async function getCredentialCoverage(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
  examId: string,
  assignmentCount: number
) {
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, batch_id")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (examError || !exam) {
    throw new Error("Ujian tidak ditemukan saat memvalidasi credential.");
  }

  const { count, error: countError } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("batch_id", exam.batch_id)
    .eq("active", true);

  if (countError) {
    throw new Error("Gagal memeriksa jumlah peserta batch.");
  }

  const activeBatchCount = count ?? 0;
  return {
    activeBatchCount,
    assignmentCount,
    missing: Math.max(activeBatchCount - assignmentCount, 0),
    complete: assignmentCount >= activeBatchCount,
  };
}
