import { createHash } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type SectionRow = {
  id: string;
  exam_id: string;
  module_id: string;
  order_index: number;
  duration_minutes: number;
};

type ModuleRow = {
  id: string;
  code: string;
  name: string;
  shuffle_questions: boolean;
  shuffle_options: boolean;
};

export type ExamSectionView = SectionRow & {
  moduleCode: string;
  moduleName: string;
};

export type SectionProgressView = {
  id: string;
  sessionId: string;
  sectionId: string;
  status: "PENDING" | "ACTIVE" | "COMPLETED" | "TIMED_OUT";
  startedAt: string | null;
  deadlineAt: string | null;
  completedAt: string | null;
};

function shuffled<T>(items: T[], seed: string) {
  // Deterministic per session. Two concurrent Start/Resume requests for the
  // same participant must generate the exact same order so a duplicate-safe
  // bulk upsert can never mix two different random permutations.
  const digest = createHash("sha256").update(seed).digest();
  let state = digest.readUInt32BE(0) || 0x9e3779b9;
  const nextUint32 = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };

  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = nextUint32() % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export async function getExamSections(
  supabase: AdminClient,
  examId: string
): Promise<ExamSectionView[]> {
  const { data: rows, error } = await supabase
    .from("exam_sections")
    .select("id, exam_id, module_id, order_index, duration_minutes")
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });

  if (error) throw new Error(`Gagal membaca sesi modul ujian: ${error.message}`);
  if (!rows?.length) return [];

  const moduleIds = [...new Set(rows.map((row) => String(row.module_id)))];
  const { data: modules, error: moduleError } = await supabase
    .from("modules")
    .select("id, code, name")
    .in("id", moduleIds);
  if (moduleError) throw new Error(`Gagal membaca modul sesi: ${moduleError.message}`);

  const map = new Map((modules ?? []).map((row) => [String(row.id), row]));
  return rows.map((row) => {
    const sectionModule = map.get(String(row.module_id));
    return {
      id: String(row.id),
      exam_id: String(row.exam_id),
      module_id: String(row.module_id),
      order_index: Number(row.order_index),
      duration_minutes: Number(row.duration_minutes),
      moduleCode: sectionModule?.code ? String(sectionModule.code) : "-",
      moduleName: sectionModule?.name ? String(sectionModule.name) : "Modul",
    };
  });
}

/**
 * Resolve the immutable module list for one assignment.
 *
 * An assignment without override rows intentionally falls back to the exam's
 * global sections, preserving every existing exam. Once at least one row is
 * present, only the explicitly selected sections are returned, in the order
 * configured on the exam. The table-missing fallback keeps old databases
 * usable while the additive migration is rolled out.
 */
export async function getExamSectionsForAssignment(
  supabase: AdminClient,
  examId: string,
  assignmentId: string
): Promise<ExamSectionView[]> {
  const globalSections = await getExamSections(supabase, examId);
  if (!globalSections.length || !assignmentId) return globalSections;

  const { data: overrides, error } = await supabase
    .from("exam_assignment_sections")
    .select("exam_section_id, order_index")
    .eq("assignment_id", assignmentId)
    .order("order_index", { ascending: true });

  // The migration is additive. Before it is applied, regular/global exams
  // must remain readable rather than failing candidate login altogether.
  if (error?.code === "42P01" || error?.code === "PGRST205") return globalSections;
  if (error) throw new Error(`Gagal membaca modul remedial peserta: ${error.message}`);
  if (!overrides?.length) return globalSections;

  const byId = new Map(globalSections.map((section) => [section.id, section]));
  const resolved = overrides
    .map((row) => byId.get(String(row.exam_section_id)))
    .filter((section): section is ExamSectionView => Boolean(section));

  // A stale/malformed override must never produce an empty candidate exam.
  // The server action prevents this state; this guard is defense in depth for
  // rows written by an older release or an interrupted migration.
  return resolved.length ? resolved : globalSections;
}

async function ensureLegacySection(supabase: AdminClient, examId: string) {
  const existing = await getExamSections(supabase, examId);
  if (existing.length) return existing;

  const { data: exam, error } = await supabase
    .from("exams")
    .select("id, module_id, duration_minutes")
    .eq("id", examId)
    .maybeSingle();
  if (error || !exam) throw new Error("Ujian tidak ditemukan saat menyiapkan sesi modul.");

  const { error: insertError } = await supabase.from("exam_sections").insert({
    exam_id: examId,
    module_id: exam.module_id,
    order_index: 1,
    duration_minutes: Math.max(1, Number(exam.duration_minutes) || 1),
  });
  if (insertError && insertError.code !== "23505") {
    throw new Error(`Sesi modul legacy gagal dibuat: ${insertError.message}`);
  }
  return getExamSections(supabase, examId);
}

export async function ensureExamSectionsForSession(
  supabase: AdminClient,
  examId: string,
  sessionId: string
) {
  const { data: session, error: sessionError } = await supabase
    .from("exam_sessions")
    .select("id, assignment_id, started_at, deadline_at, status, snapshot_ready_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError || !session) {
    throw new Error(`Sesi ujian tidak ditemukan${sessionError?.message ? `: ${sessionError.message}` : "."}`);
  }

  // Ensure legacy exams have their first section before resolving an optional
  // per-assignment remedial override.
  await ensureLegacySection(supabase, examId);
  const sections = await getExamSectionsForAssignment(
    supabase,
    examId,
    String(session.assignment_id ?? "")
  );
  if (!sections.length) throw new Error("Ujian tidak memiliki sesi modul.");
  if (String(session.status) !== "ACTIVE") return sections;

  // Once the immutable question snapshot + section progress are complete,
  // ordinary reloads / section transitions should not scan the live bank again.
  if (session.snapshot_ready_at) return sections;

  const firstSection = sections[0];

  // V2 can leave legacy question snapshots without a section tag. Those rows
  // belong to the original/first module and are repaired before R6 provisioning.
  const { error: firstTagError } = await supabase
    .from("session_questions")
    .update({ exam_section_id: firstSection.id })
    .eq("session_id", sessionId)
    .is("exam_section_id", null);
  if (firstTagError) {
    throw new Error(`Soal sesi pertama gagal ditandai: ${firstTagError.message}`);
  }

  const { data: currentQuestions, error: currentError } = await supabase
    .from("session_questions")
    .select("id, question_id, exam_section_id, order_index")
    .eq("session_id", sessionId);
  if (currentError) throw new Error(`Gagal memeriksa soal sesi: ${currentError.message}`);

  let nextOrder = Math.max(0, ...(currentQuestions ?? []).map((row) => Number(row.order_index) || 0)) + 1;
  const expectedBySection = new Map<string, string[]>();
  const moduleIds = [...new Set(sections.map((section) => section.module_id))];

  // R8.2 concurrency hardening:
  // module + question source data is static for an ACTIVE exam, so fetch it in
  // two batched queries instead of 2 queries per section for every participant.
  const [
    { data: moduleRows, error: moduleError },
    { data: questionRows, error: questionError },
  ] = await Promise.all([
    supabase
      .from("modules")
      .select("id, code, name, shuffle_questions, shuffle_options")
      .in("id", moduleIds),
    supabase
      .from("questions")
      .select("id, module_id, code, question_text, options, correct_option_id, weight, created_at")
      .in("module_id", moduleIds)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (moduleError) throw new Error(`Modul sesi gagal dibaca: ${moduleError.message}`);
  if (questionError) throw new Error(`Bank soal sesi gagal dibaca: ${questionError.message}`);

  const moduleMap = new Map(
    (moduleRows ?? []).map((module) => [
      String(module.id),
      {
        id: String(module.id),
        code: String(module.code),
        name: String(module.name),
        shuffle_questions: Boolean(module.shuffle_questions),
        shuffle_options: Boolean(module.shuffle_options),
      } satisfies ModuleRow,
    ])
  );
  const questionsByModule = new Map<string, typeof questionRows>();
  for (const question of questionRows ?? []) {
    const moduleId = String(question.module_id);
    const rows = questionsByModule.get(moduleId) ?? [];
    rows.push(question);
    questionsByModule.set(moduleId, rows);
  }

  const rowsToInsert: Array<{
    session_id: string;
    question_id: string;
    exam_section_id: string;
    order_index: number;
    option_order: string[];
    question_snapshot: Record<string, unknown>;
  }> = [];

  for (const section of sections) {
    const typedModule = moduleMap.get(section.module_id);
    if (!typedModule) throw new Error(`Modul ${section.moduleName} tidak ditemukan.`);

    const sourceQuestions = questionsByModule.get(section.module_id) ?? [];
    if (!sourceQuestions.length) throw new Error(`Modul ${section.moduleName} tidak memiliki soal aktif.`);

    const orderedQuestions = typedModule.shuffle_questions
      ? shuffled(sourceQuestions, `${sessionId}:questions:${section.id}`)
      : sourceQuestions;
    const expectedIds = orderedQuestions.map((question) => String(question.id));
    expectedBySection.set(section.id, expectedIds);

    const existingForSection = new Set(
      (currentQuestions ?? [])
        .filter((row) => String(row.exam_section_id ?? "") === section.id && row.question_id)
        .map((row) => String(row.question_id))
    );

    for (const question of orderedQuestions) {
      const questionId = String(question.id);
      if (existingForSection.has(questionId)) continue;

      const sourceOptions = Array.isArray(question.options) ? question.options : [];
      const optionIds = sourceOptions
        .map((option) => String((option as { id?: unknown }).id ?? ""))
        .filter(Boolean);
      const optionOrder = typedModule.shuffle_options
        ? shuffled(optionIds, `${sessionId}:options:${section.id}:${questionId}`)
        : optionIds;

      rowsToInsert.push({
        session_id: sessionId,
        question_id: questionId,
        exam_section_id: section.id,
        order_index: nextOrder,
        option_order: optionOrder,
        question_snapshot: {
          code: question.code,
          question_text: question.question_text,
          options: sourceOptions,
          correct_option_id: question.correct_option_id,
          weight: Number(question.weight ?? 1),
          module_id: section.module_id,
          exam_section_id: section.id,
        },
      });
      nextOrder += 1;
      existingForSection.add(questionId);
    }
  }

  // A single per-question INSERT creates a thundering herd when 100â€“200
  // participants press Start together. Upsert in bounded batches instead.
  // ignoreDuplicates turns concurrent double-starts into a safe no-op because
  // R6 already guarantees UNIQUE(session_id, question_id).
  for (let offset = 0; offset < rowsToInsert.length; offset += 100) {
    const batch = rowsToInsert.slice(offset, offset + 100);
    const { error: insertError } = await supabase
      .from("session_questions")
      .upsert(batch, {
        onConflict: "session_id,question_id",
        ignoreDuplicates: true,
      });
    if (insertError) {
      throw new Error(
        `Soal sesi gagal disiapkan secara batch [${insertError.code ?? "DB"}]: ${insertError.message}`
      );
    }
  }

  // Verify completeness rather than assuming "one row exists" means an entire
  // section was provisioned. This repairs sessions left half-created by an older
  // release and makes retries deterministic.
  const { data: verifiedQuestions, error: verifyError } = await supabase
    .from("session_questions")
    .select("question_id, exam_section_id")
    .eq("session_id", sessionId);
  if (verifyError) throw new Error(`Verifikasi soal sesi gagal: ${verifyError.message}`);

  for (const section of sections) {
    const actual = new Set(
      (verifiedQuestions ?? [])
        .filter((row) => String(row.exam_section_id ?? "") === section.id && row.question_id)
        .map((row) => String(row.question_id))
    );
    const expected = expectedBySection.get(section.id) ?? [];
    const missingCount = expected.filter((questionId) => !actual.has(questionId)).length;
    if (missingCount > 0) {
      throw new Error(`Sesi ${section.moduleName} belum lengkap: ${missingCount} soal gagal disiapkan. Coba lagi atau hubungi pengawas.`);
    }
  }

  const { data: progressRows, error: progressError } = await supabase
    .from("exam_section_progress")
    .select("id, exam_section_id, status, started_at, deadline_at")
    .eq("session_id", sessionId);
  if (progressError) throw new Error(`Progress sesi modul gagal dibaca: ${progressError.message}`);

  const progressIds = new Set((progressRows ?? []).map((row) => String(row.exam_section_id)));
  const missingProgressRows = sections
    .filter((item) => !progressIds.has(item.id))
    .map((section) => ({
      session_id: sessionId,
      exam_section_id: section.id,
      status: "PENDING",
      started_at: null,
      deadline_at: null,
      completed_at: null,
    }));

  if (missingProgressRows.length) {
    const { error: insertProgressError } = await supabase
      .from("exam_section_progress")
      .upsert(missingProgressRows, {
        onConflict: "session_id,exam_section_id",
        ignoreDuplicates: true,
      });
    if (insertProgressError) {
      throw new Error(`Progress sesi modul gagal dibuat secara batch: ${insertProgressError.message}`);
    }
  }

  const { data: repairedProgress, error: repairedProgressError } = await supabase
    .from("exam_section_progress")
    .select("id, exam_section_id, status, started_at, deadline_at")
    .eq("session_id", sessionId);
  if (repairedProgressError) throw new Error(`Progress sesi modul gagal diverifikasi: ${repairedProgressError.message}`);

  const hasStartedLifecycle = (repairedProgress ?? []).some((row) =>
    ["ACTIVE", "COMPLETED", "TIMED_OUT"].includes(String(row.status))
  );

  // Only the very first section auto-starts. Once any section has completed,
  // the next one remains PENDING until the candidate confirms readiness.
  if (!hasStartedLifecycle) {
    const firstProgress = (repairedProgress ?? []).find(
      (row) => String(row.exam_section_id) === firstSection.id && String(row.status) === "PENDING"
    );
    if (!firstProgress) throw new Error("Progress sesi pertama tidak ditemukan.");

    const startedAt = session.started_at ? String(session.started_at) : new Date().toISOString();
    const globalDeadlineMs = session.deadline_at
      ? new Date(String(session.deadline_at)).getTime()
      : Number.POSITIVE_INFINITY;
    const sectionDeadlineMs = Math.min(
      new Date(startedAt).getTime() + Math.max(1, firstSection.duration_minutes) * 60_000,
      globalDeadlineMs
    );
    const { error: activateError } = await supabase
      .from("exam_section_progress")
      .update({
        status: "ACTIVE",
        started_at: startedAt,
        deadline_at: new Date(sectionDeadlineMs).toISOString(),
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", firstProgress.id)
      .eq("status", "PENDING");
    if (activateError) throw new Error(`Sesi pertama gagal diaktifkan: ${activateError.message}`);
  }

  const { error: readyError } = await supabase
    .from("exam_sessions")
    .update({ snapshot_ready_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "ACTIVE")
    .is("snapshot_ready_at", null);
  if (readyError) throw new Error(`Sesi snapshot gagal ditandai siap: ${readyError.message}`);

  return sections;
}


export async function getSectionProgress(
  supabase: AdminClient,
  sessionId: string
): Promise<SectionProgressView[]> {
  const { data, error } = await supabase
    .from("exam_section_progress")
    .select("id, session_id, exam_section_id, status, started_at, deadline_at, completed_at")
    .eq("session_id", sessionId);
  if (error) throw new Error(`Progress sesi modul gagal dibaca: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    sessionId: String(row.session_id),
    sectionId: String(row.exam_section_id),
    status: String(row.status) as SectionProgressView["status"],
    startedAt: row.started_at ? String(row.started_at) : null,
    deadlineAt: row.deadline_at ? String(row.deadline_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  }));
}

export type SectionScore = {
  sectionId: string;
  moduleId: string;
  moduleCode: string;
  moduleName: string;
  orderIndex: number;
  rawScore: number;
  maxScore: number;
  finalScore: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
};

export async function calculateSectionScores(
  supabase: AdminClient,
  examId: string,
  sessionId: string
): Promise<SectionScore[]> {
  const { data: session, error: sessionError } = await supabase
    .from("exam_sessions")
    .select("assignment_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) throw new Error(`Sesi hasil ujian gagal dibaca: ${sessionError.message}`);
  const sections = await getExamSectionsForAssignment(
    supabase,
    examId,
    session?.assignment_id ? String(session.assignment_id) : ""
  );
  if (!sections.length) return [];

  const { data: questions, error: questionError } = await supabase
    .from("session_questions")
    .select("id, exam_section_id, question_snapshot")
    .eq("session_id", sessionId);
  if (questionError) throw new Error(`Soal hasil per modul gagal dibaca: ${questionError.message}`);

  const questionIds = (questions ?? []).map((row) => String(row.id));
  const { data: answers, error: answerError } = questionIds.length
    ? await supabase.from("answers").select("session_question_id, selected_option_id").in("session_question_id", questionIds)
    : { data: [], error: null };
  if (answerError) throw new Error(`Jawaban hasil per modul gagal dibaca: ${answerError.message}`);

  const answerMap = new Map((answers ?? []).map((row) => [String(row.session_question_id), row.selected_option_id ? String(row.selected_option_id) : null]));

  return sections.map((section) => {
    const rows = (questions ?? []).filter((row) => String(row.exam_section_id) === section.id);
    let rawScore = 0;
    let maxScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let blankCount = 0;

    for (const row of rows) {
      const snapshot = (row.question_snapshot ?? {}) as { correct_option_id?: unknown; weight?: unknown };
      const weight = Number(snapshot.weight ?? 1) || 1;
      const correct = snapshot.correct_option_id == null ? "" : String(snapshot.correct_option_id);
      const selected = answerMap.get(String(row.id)) ?? null;
      maxScore += weight;
      if (!selected) {
        blankCount += 1;
      } else if (selected === correct) {
        correctCount += 1;
        rawScore += weight;
      } else {
        wrongCount += 1;
      }
    }

    const finalScore = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
    return {
      sectionId: section.id,
      moduleId: section.module_id,
      moduleCode: section.moduleCode,
      moduleName: section.moduleName,
      orderIndex: section.order_index,
      rawScore,
      maxScore,
      finalScore: Math.round(finalScore * 100) / 100,
      correctCount,
      wrongCount,
      blankCount,
    };
  });
}
