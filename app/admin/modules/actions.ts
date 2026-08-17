"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminWriteAccess } from "@/lib/organization-subscription";
import { databaseErrorMessage } from "@/lib/db-error";
import { activeExamModuleLockMessage, getActiveExamUsingModule } from "@/lib/module-exam-lock";

function redirectWithError(message: string): never {
  redirect(`/admin/modules?error=${encodeURIComponent(message)}`);
}

function redirectWithSuccess(message: string): never {
  redirect(`/admin/modules?success=${encodeURIComponent(message)}`);
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function refreshModules(moduleId?: string) {
  revalidatePath("/admin/modules");
  revalidatePath("/admin/exams");
  revalidatePath("/admin");
  if (moduleId) revalidatePath(`/admin/modules/${moduleId}`);
}

function readModuleForm(formData: FormData) {
  const code = normalizeCode(String(formData.get("code") || ""));
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const duration = Number(formData.get("duration") || formData.get("default_duration_minutes") || 60);
  const shuffleQuestions = formData.get("shuffle_questions") === "on";
  const shuffleOptions = formData.get("shuffle_options") === "on";

  if (!code || code.length < 2 || code.length > 50) {
    redirectWithError("Kode modul wajib diisi, 2–50 karakter.");
  }
  if (!name || name.length > 150) {
    redirectWithError("Nama modul wajib diisi, maksimal 150 karakter.");
  }
  if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
    redirectWithError("Durasi modul harus 1–1440 menit.");
  }
  return {
    code,
    name,
    description,
    duration,
    shuffleQuestions,
    shuffleOptions,
  };
}

export async function createModule(formData: FormData) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();
  const input = readModuleForm(formData);

  const { data: existing, error: duplicateError } = await supabase
    .from("modules")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", input.code)
    .maybeSingle();

  if (duplicateError) throw new Error("Gagal memeriksa kode modul.");
  if (existing) redirectWithError(`Kode modul ${input.code} sudah digunakan.`);

  const { error } = await supabase.from("modules").insert({
    organization_id: organizationId,
    code: input.code,
    name: input.name,
    description: input.description,
    default_duration_minutes: input.duration,
    shuffle_questions: input.shuffleQuestions,
    shuffle_options: input.shuffleOptions,
    status: "DRAFT",
  });

  if (error) {
    redirectWithError(databaseErrorMessage("MODULE_CREATE", "Modul gagal dibuat.", error));
  }

  refreshModules();
  redirectWithSuccess(`Modul ${input.code} - ${input.name} berhasil dibuat.`);
}

export async function updateModule(moduleId: string, formData: FormData) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();
  const input = readModuleForm(formData);

  const activeExamLock = await getActiveExamUsingModule(supabase, organizationId, moduleId);
  if (activeExamLock) redirectWithError(activeExamModuleLockMessage(activeExamLock));

  const { data: duplicate } = await supabase
    .from("modules")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", input.code)
    .neq("id", moduleId)
    .maybeSingle();

  if (duplicate) redirectWithError(`Kode modul ${input.code} sudah digunakan.`);

  const { data, error } = await supabase
    .from("modules")
    .update({
      code: input.code,
      name: input.name,
      description: input.description,
      default_duration_minutes: input.duration,
      shuffle_questions: input.shuffleQuestions,
      shuffle_options: input.shuffleOptions,
    })
    .eq("id", moduleId)
    .eq("organization_id", organizationId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirectWithError(databaseErrorMessage("MODULE_UPDATE", "Modul gagal diperbarui.", error));
  }

  refreshModules(moduleId);
  redirectWithSuccess(`${input.name} berhasil diperbarui.`);
}

export async function toggleModuleStatus(moduleId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const { data: module, error } = await supabase
    .from("modules")
    .select("id, name, status")
    .eq("id", moduleId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !module) redirectWithError("Modul tidak ditemukan.");

  const next = module.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  if (next === "INACTIVE") {
    const activeExamLock = await getActiveExamUsingModule(supabase, organizationId, moduleId);
    if (activeExamLock) redirectWithError(activeExamModuleLockMessage(activeExamLock));
  }

  if (next === "ACTIVE") {
    const { count: activeQuestionCount, error: questionError } = await supabase
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("module_id", moduleId)
      .eq("status", "ACTIVE");

    if (questionError) {
      console.error("MODULE ACTIVE QUESTION CHECK ERROR:", questionError);
      redirectWithError("Gagal memeriksa soal aktif pada modul.");
    }

    if (!activeQuestionCount) {
      redirectWithError("Modul belum bisa diaktifkan karena belum memiliki soal aktif.");
    }
  }

  const { error: updateError } = await supabase
    .from("modules")
    .update({ status: next })
    .eq("id", moduleId)
    .eq("organization_id", organizationId);

  if (updateError) {
    redirectWithError(
      databaseErrorMessage(
        "MODULE_STATUS_UPDATE",
        "Status modul gagal diubah.",
        updateError
      )
    );
  }

  const { data: confirmedModule, error: confirmError } = await supabase
    .from("modules")
    .select("id, status")
    .eq("id", moduleId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (confirmError || !confirmedModule || String(confirmedModule.status) !== next) {
    redirectWithError(
      databaseErrorMessage(
        "MODULE_STATUS_VERIFY",
        "Database tidak mengonfirmasi perubahan status modul.",
        confirmError
      )
    );
  }

  refreshModules(moduleId);
  redirectWithSuccess(next === "ACTIVE" ? `${module.name} berhasil diaktifkan dan sekarang siap dipakai ujian.` : `${module.name} berhasil dinonaktifkan.`);
}

export async function deleteModule(moduleId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const [questionDependency, examDependency, sectionDependency] = await Promise.all([
    supabase
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("module_id", moduleId),
    supabase
      .from("exams")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("module_id", moduleId),
    supabase
      .from("exam_sections")
      .select("*", { count: "exact", head: true })
      .eq("module_id", moduleId),
  ]);

  if (questionDependency.error || examDependency.error || sectionDependency.error) {
    redirectWithError(
      databaseErrorMessage(
        "MODULE_DELETE_DEPENDENCY_CHECK",
        "Gagal memeriksa pemakaian modul sebelum penghapusan.",
        questionDependency.error ?? examDependency.error ?? sectionDependency.error
      )
    );
  }

  if ((questionDependency.count ?? 0) > 0 || (examDependency.count ?? 0) > 0 || (sectionDependency.count ?? 0) > 0) {
    redirectWithError("Modul masih memiliki soal atau dipakai sebagai sesi ujian. Nonaktifkan modul untuk mempertahankan riwayat.");
  }

  const { error } = await supabase
    .from("modules")
    .delete()
    .eq("id", moduleId)
    .eq("organization_id", organizationId);

  if (error) {
    redirectWithError(databaseErrorMessage("MODULE_DELETE", "Modul gagal dihapus.", error));
  }

  refreshModules();
  redirectWithSuccess("Modul berhasil dihapus.");
}
