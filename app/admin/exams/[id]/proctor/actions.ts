"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminWriteAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeExamSession } from "@/lib/exam-session-runtime";

function redirectMessage(examId: string, type: "error" | "success", message: string): never {
  redirect(`/admin/exams/${examId}/proctor?${type}=${encodeURIComponent(message)}`);
}

async function finalizeSessionBatch(
  supabase: ReturnType<typeof createAdminClient>,
  sessionIds: string[],
  concurrency = 8
) {
  let cursor = 0;
  let success = 0;
  let failed = 0;

  const workerCount = Math.min(Math.max(1, concurrency), sessionIds.length || 1);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= sessionIds.length) return;

        const sessionId = sessionIds[index];
        try {
          await finalizeExamSession(supabase, sessionId);
          success += 1;
        } catch (error) {
          failed += 1;
          console.error("BATCH FINALIZE SESSION ERROR:", sessionId, error);
        }
      }
    })
  );

  return { success, failed };
}

async function validateSession(examId: string, sessionId: string, organizationId: string) {
  const supabase = createAdminClient();
  const { data: session, error: sessionError } = await supabase
    .from("exam_sessions")
    .select("id, assignment_id, status, deadline_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session) throw new Error("Sesi ujian tidak ditemukan.");

  const { data: assignment, error: assignmentError } = await supabase
    .from("exam_assignments")
    .select("id, exam_id")
    .eq("id", session.assignment_id)
    .eq("exam_id", examId)
    .maybeSingle();

  if (assignmentError || !assignment) throw new Error("Sesi bukan bagian dari ujian ini.");

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, hard_close_at")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (examError || !exam) throw new Error("Ujian tidak ditemukan pada organisasi aktif.");

  return { supabase, session, exam };
}

export async function forceSubmitSession(examId: string, sessionId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const { supabase, session } = await validateSession(examId, sessionId, organizationId);

  if (session.status === "SUBMITTED") {
    redirectMessage(examId, "success", "Sesi peserta tersebut sudah submitted.");
  }

  try {
    await finalizeExamSession(supabase, sessionId);
  } catch (error) {
    console.error("FORCE SUBMIT SESSION ERROR:", error);
    redirectMessage(examId, "error", `Submit paksa gagal: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  revalidatePath(`/admin/exams/${examId}/proctor`);
  redirectMessage(examId, "success", "Sesi peserta berhasil di-submit oleh pengawas.");
}

export async function resetSessionViolationCounter(examId: string, sessionId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const { supabase } = await validateSession(examId, sessionId, organizationId);

  const { error } = await supabase.from("proctor_violation_resets").insert({
    organization_id: organizationId,
    exam_id: examId,
    session_id: sessionId,
  });
  if (error) {
    redirectMessage(examId, "error", "Violation counter gagal direset. Pastikan FINAL_SETUP.sql terbaru sudah dijalankan.");
  }

  revalidatePath(`/admin/exams/${examId}/proctor`);
  redirectMessage(examId, "success", "Violation counter direset tanpa menghapus audit log historis.");
}

export async function extendSessionTime(examId: string, sessionId: string, formData: FormData) {
  const { organizationId } = await requireAdminWriteAccess();
  const { supabase, session, exam } = await validateSession(examId, sessionId, organizationId);
  const minutes = Number(formData.get("minutes"));

  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
    redirectMessage(examId, "error", "Tambahan waktu harus 1-120 menit.");
  }
  if (session.status !== "ACTIVE" || !session.deadline_at) {
    redirectMessage(examId, "error", "Tambahan waktu hanya bisa diberikan ke sesi ACTIVE.");
  }

  const deadline = new Date(String(session.deadline_at));
  deadline.setMinutes(deadline.getMinutes() + minutes);
  const hardCloseMs = exam.hard_close_at ? new Date(String(exam.hard_close_at)).getTime() : Number.NaN;

  if (!Number.isFinite(hardCloseMs)) {
    redirectMessage(examId, "error", "Hard Close ujian tidak valid. Perbaiki jadwal sebelum menambah waktu.");
  }
  if (hardCloseMs <= Date.now()) {
    redirectMessage(examId, "error", "Hard Close sudah lewat. Sesi tidak dapat diperpanjang.");
  }

  const requestedDeadlineMs = deadline.getTime();
  const finalDeadline = new Date(Math.min(requestedDeadlineMs, hardCloseMs));
  const grantedMinutes = Math.max(0, Math.floor((finalDeadline.getTime() - new Date(String(session.deadline_at)).getTime()) / 60000));
  if (grantedMinutes < 1) {
    redirectMessage(examId, "error", "Tambahan waktu tidak dapat diberikan karena sesi sudah mencapai Hard Close.");
  }

  const { error } = await supabase
    .from("exam_sessions")
    .update({ deadline_at: finalDeadline.toISOString(), updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "ACTIVE");

  if (error) redirectMessage(examId, "error", "Tambahan waktu gagal disimpan.");

  revalidatePath(`/admin/exams/${examId}/proctor`);
  redirectMessage(
    examId,
    "success",
    grantedMinutes < minutes
      ? `Tambahan waktu dibatasi Hard Close: ${grantedMinutes} menit berhasil diberikan.`
      : `Tambahan waktu ${grantedMinutes} menit berhasil diberikan.`
  );
}

export async function releaseDeviceLock(examId: string, sessionId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const { supabase } = await validateSession(examId, sessionId, organizationId);

  const { error } = await supabase
    .from("proctor_client_locks")
    .delete()
    .eq("session_id", sessionId)
    .eq("exam_id", examId);

  if (error && error.code !== "42P01") {
    redirectMessage(examId, "error", "Device lock gagal dilepas.");
  }

  revalidatePath(`/admin/exams/${examId}/proctor`);
  redirectMessage(examId, "success", "Device lock dilepas. Peserta dapat claim perangkat baru pada heartbeat berikutnya.");
}


export async function finalizeOverdueSessions(examId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("id, hard_close_at")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!exam) redirectMessage(examId, "error", "Ujian tidak ditemukan pada organisasi aktif.");

  const { data: assignments, error: assignmentError } = await supabase
    .from("exam_assignments")
    .select("id")
    .eq("exam_id", examId);
  if (assignmentError) redirectMessage(examId, "error", "Assignment ujian gagal dibaca.");

  const assignmentIds = (assignments ?? []).map((row) => String(row.id));
  if (!assignmentIds.length) redirectMessage(examId, "success", "Tidak ada sesi yang perlu difinalisasi.");

  const { data: sessions, error: sessionError } = await supabase
    .from("exam_sessions")
    .select("id, deadline_at")
    .in("assignment_id", assignmentIds)
    .eq("status", "ACTIVE");
  if (sessionError) redirectMessage(examId, "error", "Sesi aktif gagal dibaca.");

  const now = Date.now();
  const hardCloseMs = exam.hard_close_at ? new Date(String(exam.hard_close_at)).getTime() : Number.NaN;
  const hardCloseReached = Number.isFinite(hardCloseMs) && hardCloseMs <= now;
  const overdue = (sessions ?? []).filter((row) =>
    hardCloseReached || (row.deadline_at && new Date(String(row.deadline_at)).getTime() <= now)
  );
  if (!overdue.length) redirectMessage(examId, "success", "Tidak ada sesi ACTIVE yang sudah melewati deadline.");

  const { success, failed } = await finalizeSessionBatch(
    supabase,
    overdue.map((session) => String(session.id)),
    8
  );

  revalidatePath(`/admin/exams/${examId}/proctor`);
  revalidatePath(`/admin/exams/${examId}/results`);
  redirectMessage(
    examId,
    failed ? "error" : "success",
    failed
      ? `${success} sesi overdue berhasil difinalisasi, ${failed} gagal. Cek log server.`
      : `${success} sesi overdue berhasil difinalisasi dan dinilai.`
  );
}

export async function forceSubmitAllActiveSessions(examId: string) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("id")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!exam) redirectMessage(examId, "error", "Ujian tidak ditemukan pada organisasi aktif.");

  const { data: assignments, error: assignmentError } = await supabase
    .from("exam_assignments")
    .select("id")
    .eq("exam_id", examId);
  if (assignmentError) redirectMessage(examId, "error", "Assignment ujian gagal dibaca.");

  const assignmentIds = (assignments ?? []).map((row) => String(row.id));
  if (!assignmentIds.length) redirectMessage(examId, "success", "Tidak ada sesi aktif.");

  const { data: sessions, error: sessionError } = await supabase
    .from("exam_sessions")
    .select("id")
    .in("assignment_id", assignmentIds)
    .eq("status", "ACTIVE");
  if (sessionError) redirectMessage(examId, "error", "Sesi aktif gagal dibaca.");
  if (!(sessions ?? []).length) redirectMessage(examId, "success", "Tidak ada sesi ACTIVE untuk di-submit.");

  const { success, failed } = await finalizeSessionBatch(
    supabase,
    (sessions ?? []).map((session) => String(session.id)),
    8
  );

  revalidatePath(`/admin/exams/${examId}/proctor`);
  redirectMessage(
    examId,
    failed ? "error" : "success",
    failed
      ? `${success} sesi berhasil di-submit, ${failed} gagal. Cek log server.`
      : `${success} sesi ACTIVE berhasil di-submit oleh pengawas.`
  );
}

export async function setAssignmentExtraTime(examId: string, assignmentId: string, formData: FormData) {
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();
  const minutes = Number(formData.get("extra_time_minutes"));

  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 240) {
    redirectMessage(examId, "error", "Extra time harus 0-240 menit.");
  }

  const { data: exam } = await supabase
    .from("exams")
    .select("id")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!exam) redirectMessage(examId, "error", "Ujian tidak ditemukan pada organisasi aktif.");

  const { data: assignment, error: assignmentError } = await supabase
    .from("exam_assignments")
    .select("id")
    .eq("id", assignmentId)
    .eq("exam_id", examId)
    .maybeSingle();
  if (assignmentError || !assignment) redirectMessage(examId, "error", "Assignment peserta tidak ditemukan.");

  const { data: activeSession } = await supabase
    .from("exam_sessions")
    .select("id")
    .eq("assignment_id", assignmentId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (activeSession) {
    redirectMessage(examId, "error", "Sesi sudah ACTIVE. Gunakan Tambah Waktu agar deadline sesi ikut berubah.");
  }

  const { error } = await supabase
    .from("exam_assignments")
    .update({ extra_time_minutes: minutes })
    .eq("id", assignmentId)
    .eq("exam_id", examId);
  if (error) redirectMessage(examId, "error", "Extra time peserta gagal disimpan.");

  revalidatePath(`/admin/exams/${examId}/proctor`);
  redirectMessage(examId, "success", `Extra time assignment diatur ${minutes} menit.`);
}
