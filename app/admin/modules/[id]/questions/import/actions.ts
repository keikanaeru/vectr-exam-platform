"use server";

import { revalidatePath } from "next/cache";

import { parseQuestionImportFile } from "@/lib/question-import";
import { requireAdminWriteAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { databaseErrorMessage } from "@/lib/db-error";
import { activeExamModuleLockMessage, getActiveExamUsingModule } from "@/lib/module-exam-lock";

export type QuestionImportDetail = {
  sourceRow: number;
  code: string;
  questionText: string;
  reason?: string;
};

export type QuestionImportState = {
  status: "idle" | "success" | "error";
  message: string;
  totalRows: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  skipped: QuestionImportDetail[];
};

const INITIAL: QuestionImportState = {
  status: "idle",
  message: "",
  totalRows: 0,
  insertedCount: 0,
  updatedCount: 0,
  skippedCount: 0,
  skipped: [],
};

function fail(message: string, partial?: Partial<QuestionImportState>): QuestionImportState {
  return { ...INITIAL, status: "error", message, ...partial };
}

export async function importQuestions(
  moduleId: string,
  _previousState: QuestionImportState,
  formData: FormData
): Promise<QuestionImportState> {
  try {
    const { organizationId } = await requireAdminWriteAccess();
    const supabase = createAdminClient();
    const file = formData.get("file");
    const duplicateMode = String(formData.get("duplicate_mode") || "skip");

    if (!(file instanceof File) || file.size === 0) return fail("Pilih file Excel atau CSV.");
    if (file.size > 8 * 1024 * 1024) return fail("Ukuran file maksimal 8 MB.");
    if (!["skip", "update"].includes(duplicateMode)) return fail("Mode duplikat tidak valid.");

    const { data: module, error: moduleError } = await supabase
      .from("modules")
      .select("id, name")
      .eq("id", moduleId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (moduleError || !module) return fail("Modul tidak ditemukan pada organisasi aktif.");

    const activeExamLock = await getActiveExamUsingModule(supabase, organizationId, moduleId);
    if (activeExamLock) return fail(activeExamModuleLockMessage(activeExamLock));

    const parsed = await parseQuestionImportFile(file);
    if (parsed.length > 3000) return fail("Satu import maksimal 3.000 soal.", { totalRows: parsed.length });

    const { data: existingRows, error: existingError } = await supabase
      .from("questions")
      .select("id, code")
      .eq("module_id", moduleId);

    if (existingError) return fail("Gagal membaca bank soal yang sudah ada.");

    const existingMap = new Map(
      (existingRows ?? []).map((row) => [String(row.code).trim().toUpperCase(), String(row.id)])
    );

    const seen = new Map<string, number>();
    const skipped: QuestionImportDetail[] = [];
    const inserts: Array<Record<string, unknown>> = [];
    const updates: Array<{ id: string; values: Record<string, unknown> }> = [];

    for (const item of parsed) {
      const code = item.code.trim().toUpperCase();
      const questionText = item.questionText.trim();
      const options = [item.optionA, item.optionB, item.optionC, item.optionD].map((value) => value.trim());
      const correct = item.correctOption.trim().toUpperCase();

      const detail = { sourceRow: item.sourceRow, code: code || "-", questionText: questionText || "-" };

      if (!code || !questionText || options.some((value) => !value)) {
        skipped.push({ ...detail, reason: "Kode, pertanyaan, dan opsi A-D wajib diisi." });
        continue;
      }
      if (!["A", "B", "C", "D"].includes(correct)) {
        skipped.push({ ...detail, reason: `Kunci jawaban "${item.correctOption}" tidak valid.` });
        continue;
      }
      if (new Set(options.map((value) => value.toLowerCase())).size < 4) {
        skipped.push({ ...detail, reason: "Pilihan jawaban A-D harus berbeda." });
        continue;
      }
      if (!Number.isFinite(item.weight) || item.weight < 0 || item.weight > 1000) {
        skipped.push({ ...detail, reason: "Bobot harus angka 0–1000." });
        continue;
      }

      const earlier = seen.get(code);
      if (earlier) {
        skipped.push({ ...detail, reason: `Kode ${code} duplikat di file; pertama muncul pada baris ${earlier}.` });
        continue;
      }
      seen.set(code, item.sourceRow);

      const values = {
        code,
        question_text: questionText,
        options: [
          { id: "A", text: options[0] },
          { id: "B", text: options[1] },
          { id: "C", text: options[2] },
          { id: "D", text: options[3] },
        ],
        correct_option_id: correct,
        weight: item.weight,
        status: item.status,
      };

      const existingId = existingMap.get(code);
      if (existingId) {
        if (duplicateMode === "update") updates.push({ id: existingId, values });
        else skipped.push({ ...detail, reason: `Kode ${code} sudah ada di bank soal. Mode saat ini: lewati duplikat.` });
        continue;
      }

      inserts.push({ module_id: moduleId, ...values });
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from("questions").insert(inserts);
      if (error) {
        console.error("QUESTION IMPORT INSERT ERROR:", error);
        return fail(databaseErrorMessage("QUESTION_IMPORT_INSERT", "Soal baru gagal disimpan. Tidak ada laporan sukses yang diterapkan.", error), {
          totalRows: parsed.length,
          skippedCount: skipped.length,
          skipped,
        });
      }
    }

    let updatedCount = 0;
    for (const update of updates) {
      const { error } = await supabase
        .from("questions")
        .update(update.values)
        .eq("id", update.id)
        .eq("module_id", moduleId);
      if (error) {
        skipped.push({
          sourceRow: 0,
          code: String(update.values.code ?? "-"),
          questionText: String(update.values.question_text ?? "-"),
          reason: databaseErrorMessage("QUESTION_IMPORT_UPDATE", "Baris duplikat gagal diperbarui di database.", error),
        });
      } else {
        updatedCount += 1;
      }
    }

    revalidatePath(`/admin/modules/${moduleId}`);
    revalidatePath(`/admin/modules/${moduleId}/questions/import`);
    revalidatePath("/admin/modules");
    revalidatePath("/admin/exams");

    return {
      status: "success",
      message: `${inserts.length} soal baru ditambahkan, ${updatedCount} diperbarui, ${skipped.length} dilewati pada modul "${module.name}".`,
      totalRows: parsed.length,
      insertedCount: inserts.length,
      updatedCount,
      skippedCount: skipped.length,
      skipped,
    };
  } catch (error) {
    console.error("QUESTION IMPORT ACTION ERROR:", error);
    return fail(error instanceof Error ? error.message : "Import bank soal gagal.");
  }
}
