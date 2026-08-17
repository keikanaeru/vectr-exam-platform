"use server";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyCandidateSessionToken,
} from "@/lib/candidate-session";
import { getExamPolicy } from "@/lib/exam-policy";
import { ensureExamSectionsForSession } from "@/lib/exam-sections";
import { getOrganizationSubscriptionState } from "@/lib/organization-subscription";

function redirectExamError(examId: string, message: string): never {
  redirect(`/candidate/exam/${examId}?error=${encodeURIComponent(message)}`);
}

export async function startOrResumeExam(
  examId: string,
  formData: FormData
) {
  const cookieStore = await cookies();

  const token = cookieStore.get(
    "candidate_session"
  )?.value;

  const candidateSession =
    verifyCandidateSessionToken(token);

  if (!candidateSession) {
    redirect("/candidate/login");
  }

  if (candidateSession.examId !== examId) {
    redirect("/candidate");
  }

  const supabase = createAdminClient();

  const {
    data: assignment,
    error: assignmentError,
  } = await supabase
    .from("exam_assignments")
    .select(
      "id, exam_id, candidate_id, active, extra_time_minutes"
    )
    .eq(
      "id",
      candidateSession.assignmentId
    )
    .eq("exam_id", examId)
    .eq(
      "candidate_id",
      candidateSession.candidateId
    )
    .eq("active", true)
    .single();

  if (assignmentError || !assignment) {
    redirect("/candidate/login");
  }

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, organization_id, status, starts_at, hard_close_at, duration_minutes, settings")
    .eq("id", examId)
    .maybeSingle();

  if (examError || !exam || !["ACTIVE", "CLOSED"].includes(String(exam.status))) {
    redirectExamError(examId, "Ujian tidak tersedia untuk dimulai.");
  }

  const now = Date.now();
  const startsAtMs = exam.starts_at ? new Date(String(exam.starts_at)).getTime() : Number.NaN;
  const hardCloseMs = exam.hard_close_at ? new Date(String(exam.hard_close_at)).getTime() : Number.NaN;

  if (!Number.isFinite(startsAtMs) || !Number.isFinite(hardCloseMs)) {
    redirectExamError(examId, "Jadwal ujian belum valid. Hubungi pengawas.");
  }
  if (now < startsAtMs) {
    redirectExamError(examId, "Ujian belum memasuki waktu mulai.");
  }
  if (now >= hardCloseMs) {
    redirectExamError(examId, "Waktu akses ujian sudah berakhir.");
  }

  const policy = getExamPolicy(exam.settings);

  if ((policy.security.enableProctoring || Boolean(policy.instructions.customRules)) && formData.get("policy_acknowledged") !== "on") {
    redirectExamError(examId, "Konfirmasi aturan ujian sebelum memulai sesi.");
  }

  const { data: existingSessions, error: existingSessionError } = await supabase
    .from("exam_sessions")
    .select("id, attempt_no, status")
    .eq("assignment_id", assignment.id)
    .order("attempt_no", { ascending: false });

  if (existingSessionError) {
    redirectExamError(examId, "Gagal memeriksa riwayat attempt ujian.");
  }

  const sessions = existingSessions ?? [];
  const activeSession = sessions.find((row) => String(row.status) === "ACTIVE");
  const highestAttempt = sessions.reduce((highest, row) => Math.max(highest, Number(row.attempt_no) || 0), 0);

  const subscription = await getOrganizationSubscriptionState(
    supabase,
    String(exam.organization_id ?? "")
  );
  if (!activeSession && !subscription.canCandidateStart) {
    redirectExamError(
      examId,
      "Penyelenggara sedang tidak menerima sesi ujian baru. Hubungi penyelenggara."
    );
  }

  if (activeSession && !policy.session.allowResume) {
    redirectExamError(examId, "Resume sesi dinonaktifkan untuk ujian ini. Hubungi pengawas.");
  }

  if (!activeSession && highestAttempt >= policy.session.maxAttempts) {
    redirectExamError(examId, `Batas maksimum ${policy.session.maxAttempts} attempt sudah tercapai.`);
  }

  let sessionId = activeSession?.id ? String(activeSession.id) : "";

  // CLOSED means no new starts. Existing ACTIVE sessions may still resume and
  // must still pass through the R6 repair/provisioning path below.
  if (String(exam.status) === "CLOSED" && !sessionId) {
    redirectExamError(examId, "Login baru untuk ujian ini sudah ditutup oleh pengawas.");
  }

  if (!sessionId) {
    const durationMinutes = Math.max(1, Number(exam.duration_minutes) || 1);
    const extraTimeMinutes = Math.max(0, Number(assignment.extra_time_minutes) || 0);
    const startedAt = new Date();
    const requestedDeadlineMs = startedAt.getTime() + (durationMinutes + extraTimeMinutes) * 60_000;
    const deadlineAt = new Date(Math.min(requestedDeadlineMs, hardCloseMs));
    const nextAttempt = highestAttempt + 1;
    const newSessionId = randomUUID();

    const { error: insertSessionError } = await supabase.from("exam_sessions").insert({
      id: newSessionId,
      assignment_id: assignment.id,
      attempt_no: nextAttempt,
      status: "ACTIVE",
      started_at: startedAt.toISOString(),
      deadline_at: deadlineAt.toISOString(),
      submitted_at: null,
      last_seen_at: startedAt.toISOString(),
      updated_at: startedAt.toISOString(),
    });

    if (insertSessionError) {
      // Double click / two tabs can race on (assignment_id, attempt_no). Reuse
      // the request that won instead of creating a second attempt.
      if (insertSessionError.code === "23505") {
        const { data: racedSession, error: racedError } = await supabase
          .from("exam_sessions")
          .select("id")
          .eq("assignment_id", assignment.id)
          .eq("status", "ACTIVE")
          .order("attempt_no", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (racedError || !racedSession?.id) {
          redirectExamError(
            examId,
            `Sesi gagal dibuat [${insertSessionError.code}]: ${insertSessionError.message}`
          );
        }
        sessionId = String(racedSession.id);
      } else {
        redirectExamError(
          examId,
          `Sesi gagal dibuat [${insertSessionError.code ?? "DB"}]: ${insertSessionError.message}`
        );
      }
    } else {
      sessionId = newSessionId;
    }
  }

  const { data: currentActiveSession, error: currentSessionError } = await supabase
    .from("exam_sessions")
    .select("id, started_at, deadline_at, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (currentSessionError || !currentActiveSession) {
    redirectExamError(
      examId,
      `Sesi aktif gagal dibaca [${currentSessionError?.code ?? "DB"}]: ${currentSessionError?.message ?? "session row tidak ditemukan"}`
    );
  }

  if (String(currentActiveSession.status) !== "ACTIVE") {
    redirect(`/candidate/exam/${examId}/result`);
  }

  // Repair legacy/partial ACTIVE rows that do not have a deadline. This keeps
  // resume backward-compatible without invoking the legacy V2 start RPC.
  if (!currentActiveSession.deadline_at) {
    const startedAtMs = currentActiveSession.started_at
      ? new Date(String(currentActiveSession.started_at)).getTime()
      : Date.now();
    const durationMinutes = Math.max(1, Number(exam.duration_minutes) || 1);
    const extraTimeMinutes = Math.max(0, Number(assignment.extra_time_minutes) || 0);
    const repairedDeadline = new Date(
      Math.min(startedAtMs + (durationMinutes + extraTimeMinutes) * 60_000, hardCloseMs)
    ).toISOString();
    const { error: repairError } = await supabase
      .from("exam_sessions")
      .update({ deadline_at: repairedDeadline, updated_at: new Date().toISOString() })
      .eq("id", currentActiveSession.id)
      .eq("status", "ACTIVE");
    if (repairError) {
      redirectExamError(examId, `Deadline sesi gagal diperbaiki [${repairError.code ?? "DB"}]: ${repairError.message}`);
    }
  } else {
    const deadlineMs = new Date(String(currentActiveSession.deadline_at)).getTime();
    if (Number.isFinite(deadlineMs) && deadlineMs > hardCloseMs) {
      const { error: capError } = await supabase
        .from("exam_sessions")
        .update({ deadline_at: new Date(hardCloseMs).toISOString(), updated_at: new Date().toISOString() })
        .eq("id", currentActiveSession.id)
        .eq("status", "ACTIVE");
      if (capError) {
        redirectExamError(examId, `Deadline sesi gagal dibatasi Hard Close [${capError.code ?? "DB"}]: ${capError.message}`);
      }
    }
  }

  try {
    await ensureExamSectionsForSession(supabase, examId, String(currentActiveSession.id));
  } catch (sectionError) {
    console.error("PREPARE EXAM SECTIONS ERROR:", sectionError);
    redirectExamError(
      examId,
      sectionError instanceof Error
        ? sectionError.message
        : "Sesi modul ujian gagal disiapkan."
    );
  }

  redirect(`/candidate/exam/${examId}/take`);
}