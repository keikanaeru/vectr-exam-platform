"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { databaseErrorMessage } from "@/lib/db-error";
import { requireAdminWriteAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";

function redirectMessage(examId: string, type: "error" | "success", message: string): never {
  redirect(`/admin/exams/${examId}/remedial?${type}=${encodeURIComponent(message)}`);
}

/**
 * Save the complete remedial matrix in one database transaction. An empty
 * matrix is intentional: it clears overrides and returns the exam to its
 * existing global-module behavior.
 */
export async function saveRemedialAssignments(examId: string, formData: FormData) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, status, organization_id")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (examError || !exam) redirectMessage(examId, "error", "Ujian tidak ditemukan pada organisasi aktif.");
  if (String(exam.status) !== "DRAFT") {
    redirectMessage(examId, "error", "Konfigurasi remedial dikunci setelah ujian diaktifkan agar snapshot peserta tetap konsisten.");
  }

  const [{ data: assignments, error: assignmentError }, { data: sections, error: sectionError }] = await Promise.all([
    supabase.from("exam_assignments").select("id, candidate_id, active").eq("exam_id", examId),
    supabase.from("exam_sections").select("id, order_index").eq("exam_id", examId).order("order_index", { ascending: true }),
  ]);

  if (assignmentError) throw new Error(`Assignment peserta gagal dibaca: ${assignmentError.message}`);
  if (sectionError) throw new Error(`Sesi modul ujian gagal dibaca: ${sectionError.message}`);

  const activeAssignments = (assignments ?? []).filter((row) => Boolean(row.active));
  const sectionIds = new Set((sections ?? []).map((row) => String(row.id)));
  if (!sectionIds.size) redirectMessage(examId, "error", "Ujian belum memiliki sesi modul untuk remedial.");

  const rows: Array<{ assignment_id: string; exam_section_id: string; order_index: number }> = [];
  const missingCandidates: string[] = [];
  const sectionOrder = new Map((sections ?? []).map((row) => [String(row.id), Number(row.order_index)]));

  for (const assignment of activeAssignments) {
    const selected = [...new Set(formData.getAll(`assignment_${assignment.id}`).map((value) => String(value).trim()).filter(Boolean))];
    const invalid = selected.some((sectionId) => !sectionIds.has(sectionId));
    if (invalid) redirectMessage(examId, "error", "Ada modul remedial yang tidak termasuk konfigurasi ujian.");
    if (!selected.length) {
      missingCandidates.push(String(assignment.candidate_id));
      continue;
    }
    for (const sectionId of selected.sort((left, right) => (sectionOrder.get(left) ?? 0) - (sectionOrder.get(right) ?? 0))) {
      rows.push({
        assignment_id: String(assignment.id),
        exam_section_id: sectionId,
        order_index: sectionOrder.get(sectionId) ?? 1,
      });
    }
  }

  // Clearing is an explicit, safe escape hatch back to global sections. A
  // normal save requires every active candidate to have at least one module.
  const clear = formData.get("clear_overrides") === "on";
  if (!clear && missingCandidates.length) {
    redirectMessage(
      examId,
      "error",
      `${missingCandidates.length} peserta belum memiliki modul remedial. Pilih minimal satu modul untuk setiap peserta atau pilih Hapus Override.`
    );
  }

  const { error: replaceError } = await supabase.rpc("replace_exam_assignment_sections", {
    p_exam_id: examId,
    p_rows: clear ? [] : rows,
  });

  if (replaceError) {
    redirectMessage(
      examId,
      "error",
      databaseErrorMessage("EXAM_REMEDIAL_ASSIGNMENTS", "Konfigurasi modul remedial gagal disimpan.", replaceError)
    );
  }

  revalidatePath("/admin/exams");
  revalidatePath(`/admin/exams/${examId}/remedial`);
  revalidatePath(`/candidate/exam/${examId}`);
  revalidatePath(`/candidate/exam/${examId}/take`);

  redirectMessage(
    examId,
    "success",
    clear
      ? "Override remedial dihapus. Semua peserta kembali memakai modul global ujian."
      : `Konfigurasi remedial tersimpan untuk ${activeAssignments.length} peserta.`
  );
}
