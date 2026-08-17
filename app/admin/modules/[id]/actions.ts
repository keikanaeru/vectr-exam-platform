"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminWriteAccess } from "@/lib/organization-subscription";
import { databaseErrorMessage } from "@/lib/db-error";
import { activeExamModuleLockMessage, getActiveExamUsingModule } from "@/lib/module-exam-lock";

function redirectWithError(moduleId: string, message: string): never {
  redirect(`/admin/modules/${moduleId}?error=${encodeURIComponent(message)}`);
}

function redirectWithSuccess(moduleId: string, message: string): never {
  redirect(`/admin/modules/${moduleId}?success=${encodeURIComponent(message)}`);
}

async function requireModule(moduleId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();
  const { data: module, error } = await supabase
    .from("modules")
    .select("id, code, name, organization_id")
    .eq("id", moduleId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error("Gagal memvalidasi modul.");
  if (!module) redirect("/admin/modules?error=" + encodeURIComponent("Modul tidak ditemukan."));

  return { organizationId, supabase, module };
}

async function requireQuestionBankMutable(moduleId: string) {
  const context = await requireModule(moduleId);
  const lock = await getActiveExamUsingModule(context.supabase, context.organizationId, moduleId);
  if (lock) redirectWithError(moduleId, activeExamModuleLockMessage(lock));
  return context;
}

function readQuestionForm(formData: FormData) {
  const code = String(formData.get("code") || "").trim().toUpperCase();
  const questionText = String(formData.get("question_text") || "").trim();
  const optionA = String(formData.get("option_a") || "").trim();
  const optionB = String(formData.get("option_b") || "").trim();
  const optionC = String(formData.get("option_c") || "").trim();
  const optionD = String(formData.get("option_d") || "").trim();
  const correctOption = String(formData.get("correct_option") || "").trim().toUpperCase();
  const weight = Number(formData.get("weight") || 1);
  const status = String(formData.get("status") || "ACTIVE").trim().toUpperCase();

  if (!code || code.length > 100) throw new Error("Kode soal wajib diisi, maksimal 100 karakter.");
  if (!questionText) throw new Error("Pertanyaan wajib diisi.");
  if (!optionA || !optionB || !optionC || !optionD) throw new Error("Pilihan A, B, C, dan D wajib diisi.");
  if (new Set([optionA, optionB, optionC, optionD].map((value) => value.toLowerCase())).size < 4) {
    throw new Error("Pilihan jawaban tidak boleh sama.");
  }
  if (!["A", "B", "C", "D"].includes(correctOption)) throw new Error("Kunci jawaban harus A, B, C, atau D.");
  if (!Number.isFinite(weight) || weight < 0 || weight > 1000) throw new Error("Bobot soal harus 0–1000.");
  if (!["ACTIVE", "INACTIVE"].includes(status)) throw new Error("Status soal tidak valid.");

  return {
    code,
    questionText,
    options: [
      { id: "A", text: optionA },
      { id: "B", text: optionB },
      { id: "C", text: optionC },
      { id: "D", text: optionD },
    ],
    correctOption,
    weight,
    status,
  };
}

function refresh(moduleId: string) {
  revalidatePath(`/admin/modules/${moduleId}`);
  revalidatePath("/admin/modules");
  revalidatePath("/admin/exams");
}

export async function createQuestion(moduleId: string, formData: FormData) {
  const { supabase } = await requireQuestionBankMutable(moduleId);

  let input: ReturnType<typeof readQuestionForm>;
  try {
    input = readQuestionForm(formData);
  } catch (error) {
    redirectWithError(moduleId, error instanceof Error ? error.message : "Data soal tidak valid.");
  }

  const { data: existing } = await supabase
    .from("questions")
    .select("id")
    .eq("module_id", moduleId)
    .eq("code", input.code)
    .maybeSingle();

  if (existing) redirectWithError(moduleId, `Kode soal ${input.code} sudah digunakan.`);

  const { error } = await supabase.from("questions").insert({
    module_id: moduleId,
    code: input.code,
    question_text: input.questionText,
    options: input.options,
    correct_option_id: input.correctOption,
    weight: input.weight,
    status: input.status,
  });

  if (error) {
    redirectWithError(moduleId, databaseErrorMessage("QUESTION_CREATE", "Soal gagal disimpan.", error));
  }

  refresh(moduleId);
  redirectWithSuccess(moduleId, `Soal ${input.code} berhasil ditambahkan.`);
}

export async function updateQuestion(moduleId: string, questionId: string, formData: FormData) {
  const { supabase } = await requireQuestionBankMutable(moduleId);

  let input: ReturnType<typeof readQuestionForm>;
  try {
    input = readQuestionForm(formData);
  } catch (error) {
    redirectWithError(moduleId, error instanceof Error ? error.message : "Data soal tidak valid.");
  }

  const { data: duplicate } = await supabase
    .from("questions")
    .select("id")
    .eq("module_id", moduleId)
    .eq("code", input.code)
    .neq("id", questionId)
    .maybeSingle();

  if (duplicate) redirectWithError(moduleId, `Kode soal ${input.code} sudah digunakan.`);

  const { data, error } = await supabase
    .from("questions")
    .update({
      code: input.code,
      question_text: input.questionText,
      options: input.options,
      correct_option_id: input.correctOption,
      weight: input.weight,
      status: input.status,
    })
    .eq("id", questionId)
    .eq("module_id", moduleId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirectWithError(moduleId, databaseErrorMessage("QUESTION_UPDATE", "Soal gagal diperbarui.", error));
  }

  refresh(moduleId);
  redirectWithSuccess(moduleId, `Soal ${input.code} berhasil diperbarui.`);
}

export async function toggleQuestionStatus(moduleId: string, questionId: string) {
  const { supabase } = await requireQuestionBankMutable(moduleId);
  const { data: question } = await supabase
    .from("questions")
    .select("id, code, status")
    .eq("id", questionId)
    .eq("module_id", moduleId)
    .maybeSingle();

  if (!question) redirectWithError(moduleId, "Soal tidak ditemukan.");

  const next = question.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  const { error } = await supabase
    .from("questions")
    .update({ status: next })
    .eq("id", questionId)
    .eq("module_id", moduleId);

  if (error) redirectWithError(moduleId, databaseErrorMessage("QUESTION_STATUS_UPDATE", "Status soal gagal diubah.", error));

  refresh(moduleId);
  redirectWithSuccess(moduleId, `Soal ${question.code} sekarang ${next}.`);
}

export async function deleteQuestion(moduleId: string, questionId: string) {
  const { supabase } = await requireQuestionBankMutable(moduleId);

  const { count: sessionQuestionCount, error: sessionQuestionError } = await supabase
    .from("session_questions")
    .select("*", { count: "exact", head: true })
    .eq("question_id", questionId);

  if (sessionQuestionError) {
    redirectWithError(
      moduleId,
      databaseErrorMessage(
        "QUESTION_DELETE_DEPENDENCY_CHECK",
        "Gagal memeriksa histori pemakaian soal.",
        sessionQuestionError
      )
    );
  }

  if ((sessionQuestionCount ?? 0) > 0) {
    redirectWithError(moduleId, "Soal sudah pernah digunakan pada sesi ujian. Nonaktifkan soal untuk menjaga riwayat.");
  }

  const { data: question } = await supabase
    .from("questions")
    .select("id, code")
    .eq("id", questionId)
    .eq("module_id", moduleId)
    .maybeSingle();

  if (!question) redirectWithError(moduleId, "Soal tidak ditemukan.");

  const { error } = await supabase
    .from("questions")
    .delete()
    .eq("id", questionId)
    .eq("module_id", moduleId);

  if (error) {
    redirectWithError(moduleId, databaseErrorMessage("QUESTION_DELETE", "Soal gagal dihapus.", error));
  }

  refresh(moduleId);
  redirectWithSuccess(moduleId, `Soal ${question.code} berhasil dihapus.`);
}
