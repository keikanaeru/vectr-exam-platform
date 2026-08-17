import { getExamPolicy } from "@/lib/exam-policy";
import { getExamSections, type ExamSectionView } from "@/lib/exam-sections";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type AssignmentDbRow = { id: string; candidate_id: string };
type CandidateDbRow = { id: string; candidate_code: string; display_name: string; external_identifier: string | null; email: string | null };
type SessionDbRow = { id: string; assignment_id: string; status: string; submitted_at: string | null; attempt_no: number | null };
type ResultDbRow = { session_id: string; raw_score: number | null; max_score: number | null; correct_count: number | null; wrong_count: number | null; blank_count: number | null; final_score: number | null };
type SessionQuestionDbRow = { id: string; session_id: string; exam_section_id: string | null; question_snapshot: unknown };
type AnswerDbRow = { session_question_id: string; selected_option_id: string | null };

export type ResultExportRow = {
  code: string;
  name: string;
  identifier: string;
  email: string;
  sessionStatus: string;
  submittedAt: string;
  correct: number | "";
  wrong: number | "";
  blank: number | "";
  rawScore: number | "";
  maxScore: number | "";
  finalScore: number | "";
  passFail: string;
  sectionScores: Record<string, number | "">;
};

export type ExamResultExportData = {
  exam: { id: string; title: string; startsAt: string | null };
  organizationName: string;
  passingScore: number;
  sections: ExamSectionView[];
  rows: ResultExportRow[];
};

export function formatWib(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function safeFileName(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ujian";
}

export async function loadExamResultExportData(
  supabase: AdminClient,
  examId: string,
  organizationId: string,
  organizationName: string
): Promise<ExamResultExportData> {
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, title, starts_at, settings")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (examError || !exam) throw new Error("Ujian tidak ditemukan.");
  const policy = getExamPolicy(exam.settings);
  const sections = await getExamSections(supabase, examId);

  const { data: assignments, error: assignmentError } = await supabase
    .from("exam_assignments")
    .select("id, candidate_id")
    .eq("exam_id", examId)
    .eq("active", true);
  if (assignmentError) throw new Error(`Assignment gagal dibaca: ${assignmentError.message}`);

  const assignmentRows = (assignments ?? []) as AssignmentDbRow[];
  const candidateIds = assignmentRows.map((row) => String(row.candidate_id));
  const assignmentIds = assignmentRows.map((row) => String(row.id));
  const { data: candidates, error: candidateError } = candidateIds.length
    ? await supabase.from("candidates").select("id, candidate_code, display_name, external_identifier, email").eq("organization_id", organizationId).in("id", candidateIds)
    : { data: [], error: null };
  if (candidateError) throw new Error(`Peserta gagal dibaca: ${candidateError.message}`);

  const { data: allSessions, error: sessionError } = assignmentIds.length
    ? await supabase.from("exam_sessions").select("id, assignment_id, status, submitted_at, attempt_no").in("assignment_id", assignmentIds)
    : { data: [], error: null };
  if (sessionError) throw new Error(`Sesi gagal dibaca: ${sessionError.message}`);

  const sessionRows = (allSessions ?? []) as SessionDbRow[];
  const latestByAssignment = new Map<string, SessionDbRow>();
  for (const session of sessionRows) {
    const key = String(session.assignment_id);
    const current = latestByAssignment.get(key);
    if (!current || Number(session.attempt_no ?? 0) > Number(current.attempt_no ?? 0)) latestByAssignment.set(key, session);
  }
  const latestSessions = [...latestByAssignment.values()];
  const sessionIds = latestSessions.map((row) => String(row.id));

  const { data: results, error: resultError } = sessionIds.length
    ? await supabase.from("results").select("session_id, raw_score, max_score, correct_count, wrong_count, blank_count, final_score").in("session_id", sessionIds)
    : { data: [], error: null };
  if (resultError) throw new Error(`Hasil gagal dibaca: ${resultError.message}`);

  const { data: sessionQuestions, error: questionError } = sessionIds.length && sections.length
    ? await supabase.from("session_questions").select("id, session_id, exam_section_id, question_snapshot").in("session_id", sessionIds)
    : { data: [], error: null };
  if (questionError) throw new Error(`Soal sesi gagal dibaca: ${questionError.message}`);
  const sessionQuestionIds = (sessionQuestions ?? []).map((row) => String(row.id));
  const { data: answers, error: answerError } = sessionQuestionIds.length
    ? await supabase.from("answers").select("session_question_id, selected_option_id").in("session_question_id", sessionQuestionIds)
    : { data: [], error: null };
  if (answerError) throw new Error(`Jawaban gagal dibaca: ${answerError.message}`);

  const candidateRows = (candidates ?? []) as CandidateDbRow[];
  const resultRows = (results ?? []) as ResultDbRow[];
  const questionRows = (sessionQuestions ?? []) as SessionQuestionDbRow[];
  const answerRows = (answers ?? []) as AnswerDbRow[];
  const candidateMap = new Map(candidateRows.map((row) => [String(row.id), row]));
  const resultMap = new Map(resultRows.map((row) => [String(row.session_id), row]));
  const answerMap = new Map(answerRows.map((row) => [String(row.session_question_id), row.selected_option_id == null ? null : String(row.selected_option_id)]));
  const questionsBySession = new Map<string, SessionQuestionDbRow[]>();
  for (const row of questionRows) {
    const key = String(row.session_id);
    const current = questionsBySession.get(key) ?? [];
    current.push(row);
    questionsBySession.set(key, current);
  }

  const rows: ResultExportRow[] = assignmentRows.map((assignment): ResultExportRow => {
    const candidate = candidateMap.get(String(assignment.candidate_id));
    const session = latestByAssignment.get(String(assignment.id)) ?? null;
    const result = session ? resultMap.get(String(session.id)) : null;
    const sectionScores: Record<string, number | ""> = {};
    if (session) {
      const questions = questionsBySession.get(String(session.id)) ?? [];
      for (const section of sections) {
        let raw = 0;
        let max = 0;
        for (const question of questions.filter((item) => String(item.exam_section_id) === section.id)) {
          const snapshot = (question.question_snapshot ?? {}) as { correct_option_id?: unknown; weight?: unknown };
          const weight = Number(snapshot.weight ?? 1) || 1;
          max += weight;
          const selected = answerMap.get(String(question.id));
          if (selected && selected === String(snapshot.correct_option_id ?? "")) raw += weight;
        }
        sectionScores[section.id] = max > 0 ? Math.round((raw / max) * 10000) / 100 : "";
      }
    }
    return {
      code: candidate ? String(candidate.candidate_code) : "-",
      name: candidate ? String(candidate.display_name) : "-",
      identifier: candidate?.external_identifier ? String(candidate.external_identifier) : "",
      email: candidate?.email ? String(candidate.email) : "",
      sessionStatus: session ? String(session.status) : "BELUM MULAI",
      submittedAt: session?.submitted_at ? formatWib(String(session.submitted_at)) : "",
      correct: result ? Number(result.correct_count ?? 0) : "",
      wrong: result ? Number(result.wrong_count ?? 0) : "",
      blank: result ? Number(result.blank_count ?? 0) : "",
      rawScore: result ? Number(result.raw_score ?? 0) : "",
      maxScore: result ? Number(result.max_score ?? 0) : "",
      finalScore: result ? Number(result.final_score ?? 0) : "",
      passFail: result ? (Number(result.final_score ?? 0) >= policy.results.passingScore ? "LULUS" : "TIDAK LULUS") : "",
      sectionScores,
    };
  }).sort((a, b) => a.code.localeCompare(b.code, "id-ID", { numeric: true }));

  return {
    exam: { id: String(exam.id), title: String(exam.title), startsAt: exam.starts_at ? String(exam.starts_at) : null },
    organizationName,
    passingScore: policy.results.passingScore,
    sections,
    rows,
  };
}
