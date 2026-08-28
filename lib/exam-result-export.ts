import { getExamPolicy } from "@/lib/exam-policy";
import { getExamSections, type ExamSectionView } from "@/lib/exam-sections";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type AssignmentDbRow = { id: string; candidate_id: string };
type CandidateDbRow = { id: string; candidate_code: string; display_name: string; external_identifier: string | null; email: string | null };
type SessionDbRow = { id: string; assignment_id: string; status: string; submitted_at: string | null; attempt_no: number | null };
type ResultDbRow = { session_id: string; raw_score: number | null; max_score: number | null; correct_count: number | null; wrong_count: number | null; blank_count: number | null; final_score: number | null };
type SessionQuestionDbRow = { id: string; session_id: string; question_id: string | null; exam_section_id: string | null; question_snapshot: unknown };
type AnswerDbRow = { session_question_id: string; selected_option_id: string | null };

type EmbeddedAnswerDbRow = {
  selected_option_id: string | null;
};

type SessionQuestionExportDbRow = SessionQuestionDbRow & {
  answer?: EmbeddedAnswerDbRow | EmbeddedAnswerDbRow[] | null;
};

type ResultExportRow = {
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
  const resultExportPerfStartedAt = Date.now();
  let resultExportPerfStageStartedAt = resultExportPerfStartedAt;
  const resultExportPerf: Record<string, number> = {};

  const markResultExportPerf = (stage: string) => {
    const now = Date.now();
    resultExportPerf[stage] = now - resultExportPerfStageStartedAt;
    resultExportPerfStageStartedAt = now;
  };

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, title, starts_at, settings")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (examError || !exam) throw new Error("Ujian tidak ditemukan.");
  const policy = getExamPolicy(exam.settings);
  const sections = await getExamSections(supabase, examId);
  markResultExportPerf("exam_and_sections");

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
  markResultExportPerf("assignments_and_candidates");

  const { data: allSessions, error: sessionError } = assignmentIds.length
    ? await supabase.from("exam_sessions").select("id, assignment_id, status, submitted_at, attempt_no").in("assignment_id", assignmentIds)
    : { data: [], error: null };
  if (sessionError) throw new Error(`Sesi gagal dibaca: ${sessionError.message}`);
  markResultExportPerf("sessions");

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

  markResultExportPerf("results");

  const sessionQuestionRows: SessionQuestionDbRow[] = [];
  const sessionQuestionSessionChunkSize = 5;
  const sessionQuestionPageSize = 1000;
  const sessionQuestionConcurrency = 4;

  if (sessionIds.length && sections.length) {
    const sessionQuestionBatches: Array<{
      batchNumber: number;
      ids: string[];
    }> = [];

    for (
      let sessionIndex = 0;
      sessionIndex < sessionIds.length;
      sessionIndex += sessionQuestionSessionChunkSize
    ) {
      sessionQuestionBatches.push({
        batchNumber:
          Math.floor(
            sessionIndex / sessionQuestionSessionChunkSize
          ) + 1,
        ids: sessionIds.slice(
          sessionIndex,
          sessionIndex + sessionQuestionSessionChunkSize
        ),
      });
    }

    const loadSessionQuestionBatch = async ({
      batchNumber,
      ids,
    }: {
      batchNumber: number;
      ids: string[];
    }) => {
      const rows: SessionQuestionDbRow[] = [];
      let rangeStart = 0;

      while (true) {
        const { data, error } = await supabase
          .from("session_questions")
          .select(
            "id, session_id, question_id, exam_section_id, question_snapshot, answer:answers!answers_session_question_id_fkey(selected_option_id)"
          )
          .in("session_id", ids)
          .order("id", { ascending: true })
          .range(
            rangeStart,
            rangeStart + sessionQuestionPageSize - 1
          );

        if (error) {
          throw new Error(
            `Soal sesi gagal dibaca (batch ${batchNumber}): ${error.message}`
          );
        }

        const page =
          (data ?? []) as SessionQuestionDbRow[];

        rows.push(...page);

        if (page.length < sessionQuestionPageSize) {
          break;
        }

        rangeStart += sessionQuestionPageSize;
      }

      return rows;
    };

    for (
      let index = 0;
      index < sessionQuestionBatches.length;
      index += sessionQuestionConcurrency
    ) {
      const batchWindow =
        sessionQuestionBatches.slice(
          index,
          index + sessionQuestionConcurrency
        );

      const batchResults = await Promise.all(
        batchWindow.map(loadSessionQuestionBatch)
      );

      for (const rows of batchResults) {
        sessionQuestionRows.push(...rows);
      }
    }
  }

  const sessionQuestions = sessionQuestionRows;

  markResultExportPerf("session_questions");

  const sessionQuestionIds = (sessionQuestions ?? []).map(
    (row) => String(row.id)
  );

  const answerRows: AnswerDbRow[] = [];
  let embeddedAnswersAvailable = true;

  for (const row of sessionQuestionRows as SessionQuestionExportDbRow[]) {
    if (!Object.prototype.hasOwnProperty.call(row, "answer")) {
      embeddedAnswersAvailable = false;
      break;
    }

    const embedded = Array.isArray(row.answer)
      ? row.answer[0] ?? null
      : row.answer ?? null;

    if (embedded) {
      answerRows.push({
        session_question_id: String(row.id),
        selected_option_id:
          embedded.selected_option_id == null
            ? null
            : String(embedded.selected_option_id),
      });
    }
  }

  markResultExportPerf("answer_batch_prep");

  if (!embeddedAnswersAvailable) {
    answerRows.length = 0;

    const answerChunkSize = 100;
    const answerConcurrency = 10;

    const answerBatches: Array<{
      batchNumber: number;
      ids: string[];
    }> = [];

    for (
      let index = 0;
      index < sessionQuestionIds.length;
      index += answerChunkSize
    ) {
      answerBatches.push({
        batchNumber: Math.floor(index / answerChunkSize) + 1,
        ids: sessionQuestionIds.slice(
          index,
          index + answerChunkSize
        ),
      });
    }

    for (
      let index = 0;
      index < answerBatches.length;
      index += answerConcurrency
    ) {
      const batchWindow = answerBatches.slice(
        index,
        index + answerConcurrency
      );

      const batchResults = await Promise.all(
        batchWindow.map(async ({ batchNumber, ids }) => {
          const { data, error } = await supabase
            .from("answers")
            .select("session_question_id, selected_option_id")
            .in("session_question_id", ids);

          if (error) {
            throw new Error(
              `Jawaban gagal dibaca (batch ${batchNumber}): ${error.message}`
            );
          }

          return (data ?? []) as AnswerDbRow[];
        })
      );

      for (const rows of batchResults) {
        answerRows.push(...rows);
      }
    }
  }

  markResultExportPerf("answer_queries");

  const sourceQuestionModuleMap = new Map<string, string>();
  const sourceQuestionIds = [...new Set(
    ((sessionQuestions ?? []) as SessionQuestionDbRow[])
      .map((row) => row.question_id == null ? "" : String(row.question_id))
      .filter(Boolean)
  )];
  const sourceQuestionChunkSize = 100;

  for (let index = 0; index < sourceQuestionIds.length; index += sourceQuestionChunkSize) {
    const chunk = sourceQuestionIds.slice(index, index + sourceQuestionChunkSize);
    const { data, error } = await supabase
      .from("questions")
      .select("id, module_id")
      .in("id", chunk);

    if (error) {
      throw new Error(
        `Modul sumber soal gagal dibaca pada batch ${Math.floor(index / sourceQuestionChunkSize) + 1}: ${error.message}`
      );
    }

    for (const row of data ?? []) {
      sourceQuestionModuleMap.set(String(row.id), String(row.module_id));
    }
  }

  const candidateRows = (candidates ?? []) as CandidateDbRow[];
  const resultRows = (results ?? []) as ResultDbRow[];
  const questionRows = (sessionQuestions ?? []) as SessionQuestionDbRow[];

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

  const validSectionIds = new Set(sections.map((section) => String(section.id)));
  const uniqueSectionByModule = new Map<string, string | null>();

  for (const section of sections) {
    const moduleId = String(section.module_id);
    if (!uniqueSectionByModule.has(moduleId)) {
      uniqueSectionByModule.set(moduleId, String(section.id));
    } else {
      uniqueSectionByModule.set(moduleId, null);
    }
  }

  const resolvedSectionByQuestion = new Map<string, string>();

  for (const question of questionRows) {
    const directSectionId =
      question.exam_section_id == null ? "" : String(question.exam_section_id);

    if (validSectionIds.has(directSectionId)) {
      resolvedSectionByQuestion.set(String(question.id), directSectionId);
      continue;
    }

    const snapshot = (question.question_snapshot ?? {}) as {
      exam_section_id?: unknown;
      module_id?: unknown;
    };

    const snapshotSectionId =
      snapshot.exam_section_id == null ? "" : String(snapshot.exam_section_id);

    if (validSectionIds.has(snapshotSectionId)) {
      resolvedSectionByQuestion.set(String(question.id), snapshotSectionId);
      continue;
    }

    const snapshotModuleId =
      snapshot.module_id == null ? "" : String(snapshot.module_id);
    const snapshotResolved = snapshotModuleId
      ? uniqueSectionByModule.get(snapshotModuleId)
      : null;

    if (snapshotResolved) {
      resolvedSectionByQuestion.set(String(question.id), snapshotResolved);
      continue;
    }

    const sourceModuleId = question.question_id
      ? sourceQuestionModuleMap.get(String(question.question_id))
      : null;
    const sourceResolved = sourceModuleId
      ? uniqueSectionByModule.get(sourceModuleId)
      : null;

    if (sourceResolved) {
      resolvedSectionByQuestion.set(String(question.id), sourceResolved);
    }
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
        for (const question of questions.filter((item) => resolvedSectionByQuestion.get(String(item.id)) === section.id)) {
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
      passFail: result
        ? sections.length === 0
          ? Number(result.final_score ?? 0) >= policy.results.passingScore
            ? "LULUS"
            : "TIDAK LULUS"
          : sections.some((section) => sectionScores[section.id] === "")
            ? "PERLU CEK"
            : sections.every(
                (section) =>
                  typeof sectionScores[section.id] === "number" &&
                  Number(sectionScores[section.id]) >= policy.results.passingScore
              )
              ? "LULUS"
              : "TIDAK LULUS"
        : "",
      sectionScores,
    };
  }).sort((a, b) => a.code.localeCompare(b.code, "id-ID", { numeric: true }));

  markResultExportPerf("source_questions_and_assemble");

  console.info("[RESULT EXPORT PERF]", {
    examId,
    ...resultExportPerf,
    total: Date.now() - resultExportPerfStartedAt,
    sessionQuestionCount: sessionQuestions.length,
    answerCount: answerRows.length,
  });

  return {
    exam: { id: String(exam.id), title: String(exam.title), startsAt: exam.starts_at ? String(exam.starts_at) : null },
    organizationName,
    passingScore: policy.results.passingScore,
    sections,
    rows,
  };
}
