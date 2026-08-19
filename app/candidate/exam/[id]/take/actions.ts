"use server";

import { cookies } from "next/headers";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  verifyCandidateSessionToken,
} from "@/lib/candidate-session";
import { getCandidateDeviceId } from "@/lib/candidate-device";
import {
  getExamPolicy,
  getViolationAction,
  type ViolationKind,
} from "@/lib/exam-policy";
import { finalizeExamSession } from "@/lib/exam-session-runtime";


const VIOLATION_KINDS = new Set<ViolationKind>([
  "TAB_HIDDEN",
  "WINDOW_BLUR",
  "FULLSCREEN_EXIT",
  "PRINT_SCREEN",
  "BLOCKED_SHORTCUT",
  "COPY_PASTE",
  "CONTEXT_MENU",
  "DUPLICATE_TAB",
  "MULTIPLE_DEVICE",
  "OFFLINE",
  "PAGE_LEAVE",
]);


async function getCandidateSession() {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      "candidate_session"
    )?.value;

  const candidateSession =
    verifyCandidateSessionToken(
      token
    );

  if (!candidateSession) {
    throw new Error(
      "Sesi peserta tidak valid. Silakan login ulang."
    );
  }

  const deviceCookie = await getCandidateDeviceId();
  if (!deviceCookie || deviceCookie !== candidateSession.deviceId) {
    throw new Error("Identitas perangkat tidak valid. Silakan login ulang dari perangkat ini.");
  }

  return candidateSession;
}


async function getActiveExamSession(examId: string) {
  const candidateSession = await getCandidateSession();

  if (candidateSession.examId !== examId) {
    throw new Error("Ujian tidak valid.");
  }

  const supabase = createAdminClient();
  const { data: examSession, error: sessionError } = await supabase
    .from("exam_sessions")
    .select("id, assignment_id, deadline_at, status")
    .eq("assignment_id", candidateSession.assignmentId)
    .order("attempt_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError || !examSession) {
    throw new Error("Sesi ujian tidak ditemukan.");
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("exam_assignments")
    .select("id, exam_id, candidate_id")
    .eq("id", examSession.assignment_id)
    .eq("exam_id", examId)
    .eq("candidate_id", candidateSession.candidateId)
    .maybeSingle();

  if (assignmentError || !assignment) {
    throw new Error("Assignment ujian tidak valid.");
  }

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, organization_id, settings, hard_close_at")
    .eq("id", examId)
    .maybeSingle();

  if (examError || !exam) {
    throw new Error("Ujian tidak ditemukan.");
  }

  return {
    supabase,
    candidateSession,
    examSession,
    assignment,
    exam,
  };
}


export async function heartbeatExam(
  examId: string,
  userAgent = ""
) {
  const candidateSession = await getCandidateSession();

  if (candidateSession.examId !== examId) {
    throw new Error("Ujian tidak valid.");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("exam_candidate_heartbeat_r82", {
    p_assignment_id: candidateSession.assignmentId,
    p_candidate_id: candidateSession.candidateId,
    p_exam_id: examId,
    p_client_id: candidateSession.deviceId,
    p_user_agent: userAgent.slice(0, 500),
  });

  if (error) {
    console.error("EXAM HEARTBEAT RPC ERROR:", error);
    return { ok: false };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: Boolean(row?.ok),
    conflict: Boolean(row?.conflict),
  };
}


async function requireActiveDeviceLease(examId: string) {
  const lease = await heartbeatExam(examId, "candidate-state-mutation");
  if (lease.conflict) {
    throw new Error("Credential sedang aktif di perangkat lain. Tutup perangkat lain atau minta pengawas melepas device lock.");
  }
  if (!lease.ok) {
    throw new Error("Sesi perangkat tidak aktif. Muat ulang halaman atau login kembali.");
  }
}


export async function recordViolation(
  examId: string,
  kind: ViolationKind,
  detail: Record<string, string | number | boolean | null> = {},
  idempotencyKey = "",
  clientEventAt = ""
) {
  if (!VIOLATION_KINDS.has(kind)) {
    throw new Error("Jenis violation tidak valid.");
  }

  const {
    supabase,
    examSession,
    assignment,
    exam,
  } = await getActiveExamSession(examId);

  if (examSession.status !== "ACTIVE") {
    return {
      ok: true,
      logged: false,
      count: 0,
      limit: 0,
      autoSubmitted: false,
    };
  }

  const policy = getExamPolicy(exam.settings);

  if (!policy.security.enableProctoring) {
    return {
      ok: true,
      logged: false,
      count: 0,
      limit: policy.security.violationLimit,
      autoSubmitted: false,
    };
  }

  const action = getViolationAction(policy, kind);

  const now = new Date().toISOString();
  const parsedClientEventAt = clientEventAt && !Number.isNaN(new Date(clientEventAt).getTime())
    ? new Date(clientEventAt).toISOString()
    : now;

  const severity = ["PRINT_SCREEN", "DUPLICATE_TAB", "MULTIPLE_DEVICE", "FULLSCREEN_EXIT"].includes(kind)
    ? "CRITICAL"
    : "WARNING";

  const safeDetail = Object.fromEntries(
    Object.entries(detail).slice(0, 20).map(([key, value]) => [key.slice(0, 80), typeof value === "string" ? value.slice(0, 500) : value])
  );

  const { error: insertError } = await supabase
    .from("proctor_events")
    .insert({
      organization_id: exam.organization_id,
      exam_id: examId,
      session_id: examSession.id,
      assignment_id: assignment.id,
      candidate_id: assignment.candidate_id,
      event_type: kind,
      severity,
      policy_action: action,
      counted: action !== "LOG",
      idempotency_key: idempotencyKey ? idempotencyKey.slice(0, 180) : null,
      detail: safeDetail,
      client_event_at: parsedClientEventAt,
    });

  if (insertError && insertError.code !== "23505") {
    console.error("PROCTOR EVENT INSERT ERROR:", insertError);
    return {
      ok: false,
      logged: false,
      setupMissing: insertError.code === "42P01",
      count: 0,
      limit: policy.security.violationLimit,
      autoSubmitted: false,
    };
  }

  const { data: latestReset, error: resetError } = await supabase
    .from("proctor_violation_resets")
    .select("created_at")
    .eq("session_id", examSession.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (resetError && resetError.code !== "42P01") {
    console.error("PROCTOR RESET READ ERROR:", resetError);
  }

  let countQuery = supabase
    .from("proctor_events")
    .select("*", { count: "exact", head: true })
    .eq("session_id", examSession.id)
    .eq("counted", true);

  if (latestReset?.created_at) {
    countQuery = countQuery.gt("created_at", String(latestReset.created_at));
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    console.error("PROCTOR EVENT COUNT ERROR:", countError);
  }

  const violationCount = count ?? 0;
  let autoSubmitted = false;

  if (
    action === "SUBMIT" ||
    (
      policy.security.autoSubmitOnLimit &&
      violationCount >= policy.security.violationLimit
    )
  ) {
    try {
      await finalizeExamSession(supabase, String(examSession.id));
      autoSubmitted = true;
    } catch (submitError) {
      console.error("PROCTOR AUTO SUBMIT ERROR:", submitError);
    }
  }

  await supabase
    .from("exam_sessions")
    .update({ last_seen_at: now, updated_at: now })
    .eq("id", examSession.id);

  return {
    ok: true,
    logged: !insertError || insertError.code === "23505",
    action,
    count: violationCount,
    limit: policy.security.violationLimit,
    autoSubmitted,
  };
}


// =====================================
// AUTOSAVE ANSWER — R8.2 ATOMIC RPC
// =====================================

export async function saveAnswer(
  sessionQuestionId: string,
  selectedOptionId: string
) {
  if (!sessionQuestionId || !selectedOptionId) {
    throw new Error("Jawaban tidak valid.");
  }

  const candidateSession = await getCandidateSession();
  const supabase = createAdminClient();

  const { error } = await supabase.rpc("exam_candidate_save_answer_r82", {
    p_assignment_id: candidateSession.assignmentId,
    p_candidate_id: candidateSession.candidateId,
    p_exam_id: candidateSession.examId,
    p_session_question_id: sessionQuestionId,
    p_selected_option_id: selectedOptionId,
    p_client_id: candidateSession.deviceId,
  });

  if (error) {
    console.error("SAVE ANSWER RPC ERROR:", error);
    throw new Error(error.message || "Jawaban gagal disimpan.");
  }

  return { ok: true };
}


// =====================================
// FLAG / TANDAI SOAL — R8.2 ATOMIC RPC
// =====================================

export async function saveFlag(
  sessionQuestionId: string,
  flagged: boolean
) {
  if (!sessionQuestionId) {
    throw new Error("Soal tidak valid.");
  }

  const candidateSession = await getCandidateSession();
  const supabase = createAdminClient();

  const { error } = await supabase.rpc("exam_candidate_save_flag_r82", {
    p_assignment_id: candidateSession.assignmentId,
    p_candidate_id: candidateSession.candidateId,
    p_exam_id: candidateSession.examId,
    p_session_question_id: sessionQuestionId,
    p_flagged: flagged,
    p_client_id: candidateSession.deviceId,
  });

  if (error) {
    console.error("SAVE FLAG RPC ERROR:", error);
    throw new Error(error.message || "Tanda soal gagal disimpan.");
  }

  return { ok: true };
}


// =====================================
// SUBMIT + SCORE
// =====================================

export async function submitExam(
  examId: string
) {
  await requireActiveDeviceLease(examId);

  const candidateSession =
    await getCandidateSession();

  if (
    candidateSession.examId !==
    examId
  ) {
    throw new Error(
      "Ujian tidak valid."
    );
  }

  const supabase =
    createAdminClient();

  const {
    data: examSession,
    error: sessionError,
  } = await supabase
    .from("exam_sessions")
    .select(
      "id, assignment_id, status"
    )
    .eq(
      "assignment_id",
      candidateSession.assignmentId
    )
    .order(
      "attempt_no",
      {
        ascending: false,
      }
    )
    .limit(1)
    .maybeSingle();

  if (
    sessionError ||
    !examSession
  ) {
    throw new Error(
      "Sesi ujian tidak ditemukan."
    );
  }

  try {
    const result = await finalizeExamSession(supabase, String(examSession.id));
    return { ok: true, result };
  } catch (error) {
    console.error("SUBMIT ERROR:", error);
    throw error;
  }
}
// =====================================
// MULTI-SECTION EXAM FLOW (R6)
// =====================================

export async function completeExamSection(
  examId: string,
  sectionId: string,
  timedOut = false
) {
  await requireActiveDeviceLease(examId);
  const { supabase, examSession, exam } = await getActiveExamSession(examId);
  if (examSession.status !== "ACTIVE") return { finished: true, nextSectionId: null };

  const sessionDeadlineMs = examSession.deadline_at ? new Date(String(examSession.deadline_at)).getTime() : Number.NaN;
  const hardCloseMs = exam.hard_close_at ? new Date(String(exam.hard_close_at)).getTime() : Number.NaN;
  const globalDeadlineMs = Number.isFinite(sessionDeadlineMs) && Number.isFinite(hardCloseMs)
    ? Math.min(sessionDeadlineMs, hardCloseMs)
    : sessionDeadlineMs;
  if (!Number.isFinite(globalDeadlineMs) || Date.now() >= globalDeadlineMs) {
    await finalizeExamSession(supabase, String(examSession.id));
    return { finished: true, nextSectionId: null };
  }

  const [{ getExamSections, getSectionProgress }] = await Promise.all([
    import("@/lib/exam-sections"),
  ]);
  const sections = await getExamSections(supabase, examId);
  const progress = await getSectionProgress(supabase, String(examSession.id));
  const target = progress.find((row) => row.sectionId === sectionId);
  if (!target) throw new Error("Sesi modul yang akan diselesaikan tidak ditemukan.");

  const currentIndex = sections.findIndex((section) => section.id === sectionId);
  if (currentIndex < 0) throw new Error("Konfigurasi sesi modul tidak ditemukan.");
  const next = sections[currentIndex + 1] ?? null;

  // Finishing can be retried after a slow network response. Treat an already
  // closed section as success instead of turning a harmless double click into
  // a candidate-facing error.
  if (target.status === "COMPLETED" || target.status === "TIMED_OUT") {
    if (!next) {
      await finalizeExamSession(supabase, String(examSession.id));
      return { finished: true, nextSectionId: null };
    }
    return {
      finished: false,
      nextSectionId: next.id,
      nextSectionName: next.moduleName,
      nextSectionCode: next.moduleCode,
      nextSectionDurationMinutes: next.duration_minutes,
    };
  }

  if (target.status !== "ACTIVE") {
    const anotherActive = progress.find((row) => row.status === "ACTIVE");
    throw new Error(
      anotherActive
        ? "Sesi modul lain sedang aktif. Muat ulang halaman untuk melanjutkan sesi yang benar."
        : "Sesi modul belum aktif. Muat ulang halaman lalu coba kembali."
    );
  }

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const sectionDeadlineMs = target.deadlineAt ? new Date(target.deadlineAt).getTime() : Number.NaN;
  const effectiveTimedOut = timedOut || (Number.isFinite(sectionDeadlineMs) && nowMs >= sectionDeadlineMs);
  const { data: closedRow, error: updateError } = await supabase
    .from("exam_section_progress")
    .update({
      status: effectiveTimedOut ? "TIMED_OUT" : "COMPLETED",
      completed_at: now,
      updated_at: now,
    })
    .eq("id", target.id)
    .eq("status", "ACTIVE")
    .select("id")
    .maybeSingle();

  if (updateError) throw new Error(`Sesi modul gagal ditutup: ${updateError.message}`);
  if (!closedRow) {
    const refreshed = await getSectionProgress(supabase, String(examSession.id));
    const repairedTarget = refreshed.find((row) => row.sectionId === sectionId);
    if (!repairedTarget || !["COMPLETED", "TIMED_OUT"].includes(repairedTarget.status)) {
      throw new Error("Status sesi modul berubah saat proses submit. Muat ulang halaman.");
    }
  }

  if (!next) {
    await finalizeExamSession(supabase, String(examSession.id));
    return { finished: true, nextSectionId: null };
  }

  return {
    finished: false,
    nextSectionId: next.id,
    nextSectionName: next.moduleName,
    nextSectionCode: next.moduleCode,
    nextSectionDurationMinutes: next.duration_minutes,
  };
}

export async function startExamSection(examId: string, sectionId: string) {
  await requireActiveDeviceLease(examId);
  const { supabase, examSession, exam } = await getActiveExamSession(examId);
  if (examSession.status !== "ACTIVE") throw new Error("Sesi ujian sudah tidak aktif.");
  if (!examSession.deadline_at) throw new Error("Deadline ujian tidak valid.");

  const [{ getExamSections, getSectionProgress }] = await Promise.all([
    import("@/lib/exam-sections"),
  ]);
  const sections = await getExamSections(supabase, examId);
  const progress = await getSectionProgress(supabase, String(examSession.id));
  const targetSection = sections.find((section) => section.id === sectionId);
  const targetProgress = progress.find((row) => row.sectionId === sectionId);

  if (!targetSection || !targetProgress) throw new Error("Sesi modul berikutnya tidak ditemukan.");

  // Retry-safe: if the first request already activated this exact section,
  // return its real deadline instead of reporting a false failure.
  if (targetProgress.status === "ACTIVE") {
    return {
      finished: false,
      sectionId,
      deadlineAt: targetProgress.deadlineAt ?? examSession.deadline_at,
    };
  }
  if (targetProgress.status === "COMPLETED" || targetProgress.status === "TIMED_OUT") {
    throw new Error("Sesi modul ini sudah selesai.");
  }
  if (targetProgress.status !== "PENDING") throw new Error("Status sesi modul tidak valid.");

  const anotherActive = progress.find((row) => row.status === "ACTIVE");
  if (anotherActive) throw new Error("Masih ada sesi modul aktif. Muat ulang halaman.");

  const targetIndex = sections.findIndex((section) => section.id === sectionId);
  const previousIds = new Set(sections.slice(0, targetIndex).map((section) => section.id));
  const previousComplete = progress
    .filter((row) => previousIds.has(row.sectionId))
    .every((row) => row.status === "COMPLETED" || row.status === "TIMED_OUT");
  if (!previousComplete) throw new Error("Sesi modul sebelumnya belum selesai.");

  const sessionDeadlineMs = new Date(String(examSession.deadline_at)).getTime();
  const hardCloseMs = exam.hard_close_at ? new Date(String(exam.hard_close_at)).getTime() : Number.NaN;
  const globalDeadlineMs = Number.isFinite(sessionDeadlineMs) && Number.isFinite(hardCloseMs)
    ? Math.min(sessionDeadlineMs, hardCloseMs)
    : sessionDeadlineMs;
  const nowMs = Date.now();
  if (!Number.isFinite(globalDeadlineMs) || nowMs >= globalDeadlineMs) {
    await finalizeExamSession(supabase, String(examSession.id));
    return { finished: true };
  }

  const sectionDeadlineMs = Math.min(
    globalDeadlineMs,
    nowMs + Math.max(1, targetSection.duration_minutes) * 60_000
  );
  const now = new Date(nowMs).toISOString();

  const { data: startedRow, error: startError } = await supabase
    .from("exam_section_progress")
    .update({
      status: "ACTIVE",
      started_at: now,
      deadline_at: new Date(sectionDeadlineMs).toISOString(),
      completed_at: null,
      updated_at: now,
    })
    .eq("id", targetProgress.id)
    .eq("status", "PENDING")
    .select("status, deadline_at")
    .maybeSingle();

  if (startError) throw new Error(`Sesi modul gagal dimulai: ${startError.message}`);
  if (!startedRow) {
    const refreshed = await getSectionProgress(supabase, String(examSession.id));
    const raced = refreshed.find((row) => row.sectionId === sectionId);
    if (raced?.status === "ACTIVE") {
      return { finished: false, sectionId, deadlineAt: raced.deadlineAt ?? new Date(sectionDeadlineMs).toISOString() };
    }
    throw new Error("Sesi modul gagal diaktifkan karena status berubah. Muat ulang halaman.");
  }

  return {
    finished: false,
    sectionId,
    deadlineAt: startedRow.deadline_at ? String(startedRow.deadline_at) : new Date(sectionDeadlineMs).toISOString(),
  };
}

