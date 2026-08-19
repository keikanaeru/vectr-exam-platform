import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCandidateSessionToken } from "@/lib/candidate-session";
import { getCandidateDeviceId } from "@/lib/candidate-device";
import { getExamPolicy } from "@/lib/exam-policy";
import {
  ensureExamSectionsForSession,
  getExamSections,
  getSectionProgress,
} from "@/lib/exam-sections";
import { getOrganizationBranding } from "@/lib/organization-branding";
import { finalizeExamSession } from "@/lib/exam-session-runtime";

import ExamClient from "./ExamClient";
import SectionTransition from "./SectionTransition";

export const dynamic = "force-dynamic";

type SnapshotOption = { id: string; text: string };
type QuestionSnapshot = { code?: string; question_text?: string; options?: SnapshotOption[] };

export default async function TakeExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: examId } = await params;
  const token = (await cookies()).get("candidate_session")?.value;
  const candidateSession = verifyCandidateSessionToken(token);
  if (!candidateSession) redirect("/candidate/login");
  if (candidateSession.examId !== examId) redirect("/candidate");

  const deviceId = await getCandidateDeviceId();
  if (!deviceId || deviceId !== candidateSession.deviceId) redirect("/candidate/login");

  const supabase = createAdminClient();
  const { data: leaseData, error: leaseError } = await supabase.rpc("exam_candidate_heartbeat_r82", {
    p_assignment_id: candidateSession.assignmentId,
    p_candidate_id: candidateSession.candidateId,
    p_exam_id: examId,
    p_client_id: candidateSession.deviceId,
    p_user_agent: "take-page",
  });
  if (leaseError) throw new Error("Device lease ujian gagal diperiksa.");
  const lease = Array.isArray(leaseData) ? leaseData[0] : leaseData;
  if (lease?.conflict) {
    redirect(`/candidate/exam/${examId}?error=${encodeURIComponent("Credential sedang aktif di perangkat lain. Tutup perangkat lain atau minta pengawas melepas device lock.")}`);
  }
  if (!lease?.ok) redirect(`/candidate/exam/${examId}`);

  const { data: examSession, error: sessionError } = await supabase
    .from("exam_sessions")
    .select("id, assignment_id, attempt_no, started_at, deadline_at, status")
    .eq("assignment_id", candidateSession.assignmentId)
    .order("attempt_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessionError || !examSession) redirect(`/candidate/exam/${examId}`);
  if (examSession.status === "SUBMITTED") redirect(`/candidate/exam/${examId}/result`);

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, organization_id, title, settings, hard_close_at")
    .eq("id", examId)
    .maybeSingle();
  if (examError || !exam) throw new Error("Pengaturan ujian tidak dapat dibaca.");

  const hardCloseMs = exam.hard_close_at ? new Date(String(exam.hard_close_at)).getTime() : Number.NaN;
  const sessionDeadlineMs = examSession.deadline_at ? new Date(String(examSession.deadline_at)).getTime() : Number.NaN;
  const effectiveDeadlineMs = Number.isFinite(hardCloseMs) && Number.isFinite(sessionDeadlineMs)
    ? Math.min(hardCloseMs, sessionDeadlineMs)
    : sessionDeadlineMs;

  if (
    examSession.status === "ACTIVE" &&
    Number.isFinite(hardCloseMs) &&
    Number.isFinite(sessionDeadlineMs) &&
    sessionDeadlineMs > hardCloseMs
  ) {
    await supabase
      .from("exam_sessions")
      .update({ deadline_at: new Date(hardCloseMs).toISOString(), updated_at: new Date().toISOString() })
      .eq("id", examSession.id)
      .eq("status", "ACTIVE");
  }

  if (Number.isFinite(effectiveDeadlineMs) && Date.now() >= effectiveDeadlineMs) {
    try {
      await finalizeExamSession(supabase, String(examSession.id));
    } catch (error) {
      console.error("AUTO FINALIZE ERROR:", error);
      throw new Error(
        error instanceof Error
          ? `Waktu ujian sudah habis, tetapi finalisasi hasil gagal: ${error.message}`
          : "Waktu ujian sudah habis, tetapi finalisasi hasil gagal."
      );
    }
    redirect(`/candidate/exam/${examId}/result`);
  }

  if (examSession.status !== "ACTIVE" || !examSession.deadline_at) redirect("/candidate");

  const policy = getExamPolicy(exam.settings);
  const sections = await ensureExamSectionsForSession(supabase, examId, String(examSession.id));
  let progress = await getSectionProgress(supabase, String(examSession.id));

  // Section timer is independent, but never pauses the global exam timer.
  const activeProgress = progress.find((row) => row.status === "ACTIVE");
  if (activeProgress?.deadlineAt && Date.now() >= new Date(activeProgress.deadlineAt).getTime()) {
    const now = new Date().toISOString();
    await supabase
      .from("exam_section_progress")
      .update({ status: "TIMED_OUT", completed_at: now, updated_at: now })
      .eq("id", activeProgress.id)
      .eq("status", "ACTIVE");
    progress = await getSectionProgress(supabase, String(examSession.id));
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", exam.organization_id)
    .maybeSingle();
  const branding = await getOrganizationBranding(
    String(exam.organization_id),
    organization?.name ? String(organization.name) : "VECTR Exam Platform"
  );

  const active = progress.find((row) => row.status === "ACTIVE");
  if (!active) {
    const pendingSection = sections.find((section) => {
      const row = progress.find((item) => item.sectionId === section.id);
      return row?.status === "PENDING";
    });

    if (!pendingSection) {
      await finalizeExamSession(supabase, String(examSession.id));
      redirect(`/candidate/exam/${examId}/result`);
    }

    const pendingIndex = sections.findIndex((section) => section.id === pendingSection.id);
    const previous = pendingIndex > 0 ? sections[pendingIndex - 1] : null;
    return (
      <SectionTransition
        examId={examId}
        policy={policy}
        globalDeadlineAt={Number.isFinite(effectiveDeadlineMs) ? new Date(effectiveDeadlineMs).toISOString() : examSession.deadline_at}
        completedSectionName={previous?.moduleName ?? null}
        nextSection={{
          id: pendingSection.id,
          name: pendingSection.moduleName,
          code: pendingSection.moduleCode,
          durationMinutes: pendingSection.duration_minutes,
          position: pendingIndex + 1,
          total: sections.length,
        }}
        branding={branding}
      />
    );
  }

  const section = sections.find((item) => item.id === active.sectionId);
  if (!section) throw new Error("Sesi modul aktif tidak ditemukan.");

  const { data: rows, error: questionError } = await supabase
    .from("session_questions")
    .select("id, order_index, option_order, question_snapshot")
    .eq("session_id", examSession.id)
    .eq("exam_section_id", section.id)
    .order("order_index", { ascending: true });
  if (questionError) throw new Error(questionError.message);

  const questions = (rows ?? []).map((row) => {
    const snapshot = (row.question_snapshot ?? {}) as QuestionSnapshot;
    const sourceOptions = Array.isArray(snapshot.options) ? snapshot.options : [];
    const optionOrder = Array.isArray(row.option_order)
      ? (row.option_order as string[])
      : sourceOptions.map((option) => option.id);
    const options = optionOrder
      .map((optionId) => sourceOptions.find((option) => String(option.id) === String(optionId)))
      .filter((option): option is SnapshotOption => Boolean(option));
    return {
      id: String(row.id),
      orderIndex: Number(row.order_index),
      code: snapshot.code ?? "",
      questionText: snapshot.question_text ?? "",
      options,
    };
  });

  const ids = questions.map((question) => question.id);
  const initialAnswers: Record<string, string> = {};
  const initialFlags: Record<string, boolean> = {};
  if (ids.length) {
    const { data: answers, error: answerError } = await supabase
      .from("answers")
      .select("session_question_id, selected_option_id, flagged")
      .in("session_question_id", ids);
    if (answerError) throw new Error(answerError.message);
    for (const answer of answers ?? []) {
      const questionId = String(answer.session_question_id);
      if (answer.selected_option_id) initialAnswers[questionId] = String(answer.selected_option_id);
      initialFlags[questionId] = Boolean(answer.flagged);
    }
  }

  const sectionIndex = sections.findIndex((item) => item.id === section.id);
  return (
    <ExamClient
      examId={examId}
      policy={policy}
      globalDeadlineAt={Number.isFinite(effectiveDeadlineMs) ? new Date(effectiveDeadlineMs).toISOString() : examSession.deadline_at}
      sectionDeadlineAt={active.deadlineAt ?? examSession.deadline_at}
      section={{
        id: section.id,
        name: section.moduleName,
        code: section.moduleCode,
        position: sectionIndex + 1,
        total: sections.length,
      }}
      branding={branding}
      questions={questions}
      initialAnswers={initialAnswers}
      initialFlags={initialFlags}
    />
  );
}
