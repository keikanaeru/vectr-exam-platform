"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getExamPolicy, mergeExamPolicyIntoSettings } from "@/lib/exam-policy";
import { requireAdminWriteAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { databaseErrorMessage } from "@/lib/db-error";

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function integer(formData: FormData, name: string, fallback: number, min: number, max: number) {
  const value = Number(formData.get(name));
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function decimal(formData: FormData, name: string, fallback: number, min: number, max: number) {
  const value = Number(formData.get(name));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function punishment(formData: FormData, name: string, fallback: "LOG" | "COUNT" | "SUBMIT") {
  const value = String(formData.get(name) || "");
  return value === "LOG" || value === "COUNT" || value === "SUBMIT" ? value : fallback;
}

function redirectMessage(examId: string, type: "error" | "success", message: string): never {
  redirect(`/admin/exams/${examId}/settings?${type}=${encodeURIComponent(message)}`);
}

export async function updateExamPolicy(examId: string, formData: FormData) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const { data: exam, error } = await supabase
    .from("exams")
    .select("id, status, settings")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !exam) {
    redirectMessage(examId, "error", "Ujian tidak ditemukan pada organisasi aktif.");
  }

  const current = getExamPolicy(exam.settings);
  const runtimeLocked = String(exam.status) !== "DRAFT";
  const policy = {
    ...current,
    security: runtimeLocked ? current.security : {
      enableProctoring: checked(formData, "enable_proctoring"),
      requireFullscreen: checked(formData, "require_fullscreen"),
      detectTabSwitch: checked(formData, "detect_tab_switch"),
      detectWindowBlur: checked(formData, "detect_window_blur"),
      detectPrintScreen: checked(formData, "detect_print_screen"),
      preventCopyPaste: checked(formData, "prevent_copy_paste"),
      preventContextMenu: checked(formData, "prevent_context_menu"),
      preventPrint: checked(formData, "prevent_print"),
      preventSavePage: checked(formData, "prevent_save_page"),
      preventDevtoolsShortcuts: checked(formData, "prevent_devtools_shortcuts"),
      preventTextSelection: checked(formData, "prevent_text_selection"),
      detectDuplicateTab: checked(formData, "detect_duplicate_tab"),
      enforceSingleDevice: checked(formData, "enforce_single_device"),
      detectOffline: checked(formData, "detect_offline"),
      warnBeforeAutoSubmit: checked(formData, "warn_before_auto_submit"),
      violationLimit: integer(formData, "violation_limit", current.security.violationLimit, 1, 50),
      autoSubmitOnLimit: checked(formData, "auto_submit_on_limit"),
      punishments: {
        TAB_HIDDEN: punishment(formData, "punishment_tab_hidden", current.security.punishments.TAB_HIDDEN),
        WINDOW_BLUR: punishment(formData, "punishment_window_blur", current.security.punishments.WINDOW_BLUR),
        FULLSCREEN_EXIT: punishment(formData, "punishment_fullscreen_exit", current.security.punishments.FULLSCREEN_EXIT),
        PRINT_SCREEN: punishment(formData, "punishment_print_screen", current.security.punishments.PRINT_SCREEN),
        BLOCKED_SHORTCUT: punishment(formData, "punishment_blocked_shortcut", current.security.punishments.BLOCKED_SHORTCUT),
        COPY_PASTE: punishment(formData, "punishment_copy_paste", current.security.punishments.COPY_PASTE),
        CONTEXT_MENU: punishment(formData, "punishment_context_menu", current.security.punishments.CONTEXT_MENU),
        DUPLICATE_TAB: punishment(formData, "punishment_duplicate_tab", current.security.punishments.DUPLICATE_TAB),
        MULTIPLE_DEVICE: punishment(formData, "punishment_multiple_device", current.security.punishments.MULTIPLE_DEVICE),
        OFFLINE: punishment(formData, "punishment_offline", current.security.punishments.OFFLINE),
        PAGE_LEAVE: punishment(formData, "punishment_page_leave", current.security.punishments.PAGE_LEAVE),
      },
    },
    session: runtimeLocked ? current.session : {
      maxAttempts: integer(formData, "max_attempts", current.session.maxAttempts, 1, 10),
      allowResume: checked(formData, "allow_resume"),
      warnOnPageLeave: checked(formData, "warn_on_page_leave"),
      allowPreviousQuestion: checked(formData, "allow_previous_question"),
      confirmBeforeSubmit: checked(formData, "confirm_before_submit"),
      showQuestionCode: checked(formData, "show_question_code"),
    },
    results: {
      showResultPage: checked(formData, "show_result_page"),
      showFinalScore: checked(formData, "show_final_score"),
      showScoreBreakdown: checked(formData, "show_score_breakdown"),
      showCompletionSummary: checked(formData, "show_completion_summary"),
      showPassFail: checked(formData, "show_pass_fail"),
      passingScore: decimal(formData, "passing_score", current.results.passingScore, 0, 100),
    },
    instructions: runtimeLocked ? current.instructions : {
      customRules: String(formData.get("custom_rules") || "").trim().slice(0, 4000),
    },
  };

  const { error: updateError } = await supabase
    .from("exams")
    .update({ settings: mergeExamPolicyIntoSettings(exam.settings, policy) })
    .eq("id", examId)
    .eq("organization_id", organizationId);

  if (updateError) {
    redirectMessage(examId, "error", databaseErrorMessage("EXAM_POLICY_UPDATE", "Pengaturan ujian gagal disimpan.", updateError));
  }

  revalidatePath("/admin/exams");
  revalidatePath(`/admin/exams/${examId}/settings`);
  revalidatePath(`/candidate/exam/${examId}`);
  revalidatePath(`/candidate/exam/${examId}/take`);
  revalidatePath(`/candidate/exam/${examId}/result`);

  redirectMessage(
    examId,
    "success",
    runtimeLocked
      ? "Pengaturan hasil berhasil disimpan. Security, punishment, sesi, dan instruksi tetap terkunci sejak ujian diaktifkan."
      : "Pengaturan keamanan, sesi, hasil, dan instruksi berhasil disimpan."
  );
}
