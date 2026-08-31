"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import type { ExamPolicy } from "@/lib/exam-policy";
import CandidateThemeToggle from "@/app/candidate/ui/CandidateThemeToggle";
import CandidateBrand from "@/app/candidate/ui/CandidateBrand";
import PoweredBy from "@/app/candidate/ui/PoweredBy";
import CandidateSubmitDialog from "@/app/candidate/ui/CandidateSubmitDialog";
import ExamGuard from "./ExamGuard";

import {
  saveAnswer,
  saveFlag,
  submitExam,
  completeExamSection,
} from "./actions";


type Option = {
  id: string;
  text: string;
};


type Question = {
  id: string;
  orderIndex: number;
  code: string;
  questionText: string;
  options: Option[];
};


type SaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "error";


type Props = {
  examId: string;

  policy: ExamPolicy;

  globalDeadlineAt: string;

  sectionDeadlineAt: string;

  section: {
    id: string;
    name: string;
    code: string;
    position: number;
    total: number;
  };

  branding: {
    displayName: string;
    logoUrl: string | null;
    showPoweredBy: boolean;
  };

  questions: Question[];

  initialAnswers?: Record<
    string,
    string
  >;

  initialFlags?: Record<
    string,
    boolean
  >;
};


function formatTime(
  seconds: number
) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}


export default function ExamClient({
  examId,
  policy,
  globalDeadlineAt,
  sectionDeadlineAt,
  section,
  branding,
  questions = [],
  initialAnswers = {},
  initialFlags = {},
}: Props) {
  const router =
    useRouter();


  // =====================================
  // CURRENT QUESTION
  // =====================================

  const [
    currentIndex,
    setCurrentIndex,
  ] =
    useState(0);


  // =====================================
  // ANSWERS
  // =====================================

  const [
    selectedAnswers,
    setSelectedAnswers,
  ] =
    useState<
      Record<string, string>
    >(() => ({
      ...initialAnswers,
    }));


  // =====================================
  // FLAGS
  // =====================================

  const [
    flags,
    setFlags,
  ] =
    useState<
      Record<string, boolean>
    >(() => ({
      ...initialFlags,
    }));


  // =====================================
  // SAVE STATUS
  // =====================================

  const [
    saveStatuses,
    setSaveStatuses,
  ] =
    useState<
      Record<
        string,
        SaveStatus
      >
    >({});


  const [
    flagSaving,
    setFlagSaving,
  ] =
    useState<
      Record<string, boolean>
    >({});


  // =====================================
  // SUBMIT STATE
  // =====================================

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);


  const [
    submitError,
    setSubmitError,
  ] =
    useState("");

  const [submitFailureKind, setSubmitFailureKind] = useState<"section" | "global" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [globalRemaining, setGlobalRemaining] = useState(0);
  const [globalTimerReady, setGlobalTimerReady] = useState(false);


  const submittingRef =
    useRef(false);


  // =====================================
  // TIMER
  // =====================================

  /*
    Jangan hitung Date.now() langsung di initial state.

    Server dan browser bisa menghasilkan detik berbeda,
    sehingga React menganggap HTML server dan client
    tidak sama dan menghasilkan hydration error.

    Timer dimulai dengan 0, tetapi belum dianggap aktif
    sampai timerReady = true.
  */

  const [
    remaining,
    setRemaining,
  ] =
    useState(0);


  const [
    timerReady,
    setTimerReady,
  ] =
    useState(false);


  useEffect(() => {
    const tick = () => {
      const seconds =
        Math.max(
          0,
          Math.ceil(
            (
              new Date(
                sectionDeadlineAt
              ).getTime() -
              Date.now()
            ) / 1000
          )
        );


      setRemaining(
        seconds
      );
    };


    tick();


    setTimerReady(
      true
    );


    const timer =
      window.setInterval(
        tick,
        1000
      );


    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [
    sectionDeadlineAt,
  ]);

  useEffect(() => {
    const tick = () => {
      setGlobalRemaining(Math.max(0, Math.ceil((new Date(globalDeadlineAt).getTime() - Date.now()) / 1000)));
      setGlobalTimerReady(true);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [globalDeadlineAt]);


  // =====================================
  // CURRENT QUESTION DATA
  // =====================================

  const question =
    questions[
      currentIndex
    ] ??
    questions[0] ??
    null;


  const expired =
    timerReady &&
    remaining <= 0;


  const currentStatus =
    question
      ? saveStatuses?.[
          question.id
        ] ??
        "idle"
      : "idle";


  const isSaving =
    currentStatus ===
    "saving";


  const currentFlag =
    question
      ? Boolean(
          flags?.[
            question.id
          ]
        )
      : false;


  // =====================================
  // SAVE ANSWER
  // =====================================

  async function selectAnswer(
    questionId: string,
    optionId: string
  ) {
    if (
      expired ||
      submittingRef.current
    ) {
      return;
    }


    const oldValue =
      selectedAnswers?.[
        questionId
      ];


    setSelectedAnswers(
      (previous = {}) => ({
        ...previous,

        [questionId]:
          optionId,
      })
    );


    setSaveStatuses(
      (previous = {}) => ({
        ...previous,

        [questionId]:
          "saving",
      })
    );


    try {
      await saveAnswer(
        questionId,
        optionId
      );


      setSaveStatuses(
        (previous = {}) => ({
          ...previous,

          [questionId]:
            "saved",
        })
      );
    } catch (error) {
      console.error(
        error
      );


      setSelectedAnswers(
        (previous = {}) => {
          const next = {
            ...previous,
          };


          if (oldValue) {
            next[
              questionId
            ] =
              oldValue;
          } else {
            delete next[
              questionId
            ];
          }


          return next;
        }
      );


      setSaveStatuses(
        (previous = {}) => ({
          ...previous,

          [questionId]:
            "error",
        })
      );
    }
  }


  // =====================================
  // FLAG QUESTION
  // =====================================

  async function toggleFlag(
    questionId: string
  ) {
    if (
      expired ||
      submittingRef.current
    ) {
      return;
    }


    const oldValue =
      Boolean(
        flags?.[
          questionId
        ]
      );


    const nextValue =
      !oldValue;


    setFlags(
      (previous = {}) => ({
        ...previous,

        [questionId]:
          nextValue,
      })
    );


    setFlagSaving(
      (previous = {}) => ({
        ...previous,

        [questionId]:
          true,
      })
    );


    try {
      await saveFlag(
        questionId,
        nextValue
      );
    } catch (error) {
      console.error(
        error
      );


      setFlags(
        (previous = {}) => ({
          ...previous,

          [questionId]:
            oldValue,
        })
      );
    } finally {
      setFlagSaving(
        (previous = {}) => ({
          ...previous,

          [questionId]:
            false,
        })
      );
    }
  }


  // =====================================
  // SUBMIT
  // =====================================

  const performSectionFinish = useCallback(
    async (timedOut: boolean) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError("");
      setSubmitFailureKind(null);
      setConfirmOpen(false);
      try {
        const result = await completeExamSection(examId, section.id, timedOut);
        if (result.finished) {
          router.replace(`/candidate/exam/${examId}/result`);
        } else {
          router.refresh();
        }
      } catch (error) {
        console.error("SECTION FINISH ERROR:", error);
        submittingRef.current = false;
        setSubmitting(false);
        setSubmitFailureKind("section");
        const detail = error instanceof Error ? error.message : "Sesi gagal diselesaikan.";
        setSubmitError(timedOut
          ? `Waktu sesi habis, tetapi penutupan otomatis gagal: ${detail}`
          : detail);
      }
    },
    [examId, router, section.id]
  );

  const finishExam = useCallback(
    async (automatic: boolean) => {
      if (automatic) {
        await performSectionFinish(true);
        return;
      }
      if (policy.session.confirmBeforeSubmit) {
        setConfirmOpen(true);
        return;
      }
      await performSectionFinish(false);
    },
    [performSectionFinish, policy.session.confirmBeforeSubmit]
  );

  const performGlobalSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    setSubmitFailureKind(null);
    setConfirmOpen(false);
    try {
      await submitExam(examId);
      router.replace(`/candidate/exam/${examId}/result`);
      router.refresh();
    } catch (error) {
      console.error("GLOBAL AUTO SUBMIT ERROR:", error);
      submittingRef.current = false;
      setSubmitting(false);
      setSubmitFailureKind("global");
      const detail = error instanceof Error ? error.message : "Submit otomatis gagal.";
      setSubmitError(`Waktu total ujian habis, tetapi submit otomatis gagal: ${detail}`);
    }
  }, [examId, router]);

  // =====================================
  // AUTO SUBMIT TIMER 0
  // =====================================

  useEffect(() => {
    if (
      timerReady &&
      remaining <= 0 &&
      !submittingRef.current
    ) {
      void finishExam(
        true
      );
    }
  }, [
    timerReady,
    remaining,
    finishExam,
  ]);

  useEffect(() => {
    if (!globalTimerReady || globalRemaining > 0 || submittingRef.current) return;
    void performGlobalSubmit();
  }, [globalRemaining, globalTimerReady, performGlobalSubmit]);


  // =====================================
  // SUMMARY
  // =====================================

  const answeredCount =
    Object.keys(
      selectedAnswers ??
      {}
    ).length;


  const flaggedCount =
    Object.values(
      flags ??
      {}
    ).filter(
      Boolean
    ).length;


  const blankCount =
    Math.max(
      0,

      questions.length -
      answeredCount
    );


  const progress =
    questions.length > 0
      ? Math.round(
          (
            answeredCount /
            questions.length
          ) *
          100
        )
      : 0;


  const urgent =
    timerReady &&
    remaining <= 60;


  if (!question) {
    return (
      <main className="candidate-surface relative flex min-h-screen items-center justify-center overflow-hidden px-6">
        <div className="fixed right-4 top-4 z-[80]"><CandidateThemeToggle /></div>
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500/[0.06] blur-[110px]" />
        </div>

        <div className="candidate-card relative z-10 max-w-md p-8 text-center">
          <div className="relative z-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/15 bg-rose-400/[0.06] text-lg font-bold text-rose-300">
              !
            </div>

            <h1 className="mt-5 text-xl font-semibold text-white">
              Tidak ada soal
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Sistem tidak menemukan soal pada sesi ujian ini.
            </p>
          </div>
        </div>
      </main>
    );
  }


  // =====================================
  // UI
  // =====================================

  return (
    <main className="candidate-surface relative min-h-screen overflow-x-hidden">

      <ExamGuard
        examId={examId}
        policy={policy}
      />

      {/* ================================= */}
      {/* BACKGROUND GLOW */}
      {/* ================================= */}

      <div className="pointer-events-none fixed inset-0">

        <div className="absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-blue-500/[0.06] blur-[120px]" />

        <div className="absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-violet-500/[0.055] blur-[120px]" />

      </div>


      {/* ================================= */}
      {/* HEADER */}
      {/* ================================= */}

      <div className="sticky top-0 z-40 px-3 pt-3 sm:px-5">

        <header className="candidate-nav mx-auto max-w-7xl rounded-[24px]">

          <div className="flex flex-col gap-4 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">

            {/* LEFT */}

            <div className="flex items-center gap-3">

              <CandidateBrand
                displayName={branding.displayName}
                logoUrl={branding.logoUrl}
                subtitle={`${section.name} · Soal ${currentIndex + 1} dari ${questions.length}`}
              />

            </div>


            {/* RIGHT */}

            <div className="flex items-center justify-between gap-3 sm:justify-end">

              <CandidateThemeToggle compact />

              {/* SAVE STATUS */}

              <div className="min-w-[125px] text-right">

                {currentStatus ===
                  "saving" && (

                  <div className="flex items-center justify-end gap-2 text-xs text-amber-300">

                    <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />

                    Menyimpan...

                  </div>

                )}


                {currentStatus ===
                  "saved" && (

                  <div className="flex items-center justify-end gap-2 text-xs text-emerald-300">

                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />

                    Jawaban tersimpan

                  </div>

                )}


                {currentStatus ===
                  "error" && (

                  <div className="flex items-center justify-end gap-2 text-xs text-rose-300">

                    <span className="h-2 w-2 rounded-full bg-rose-400" />

                    Gagal menyimpan

                  </div>

                )}


                {currentStatus ===
                  "idle" && (

                  <p className="text-[11px] text-slate-600">
                    Autosave aktif
                  </p>

                )}

              </div>


              {/* TIMERS */}

              <div className="hidden rounded-[16px] border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 backdrop-blur-xl sm:block">
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Ujian</p>
                <p className="mt-0.5 font-mono text-xl font-bold tracking-tight text-white">
                  {globalTimerReady ? formatTime(globalRemaining) : "--:--"}
                </p>
              </div>

              <div
                className={
                  urgent
                    ? "rounded-[16px] border border-rose-400/25 bg-rose-400/[0.08] px-4 py-2.5 shadow-[0_0_25px_rgba(244,63,94,0.08)] backdrop-blur-xl"
                    : "rounded-[16px] border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 backdrop-blur-xl"
                }
              >

                <p
                  className={
                    urgent
                      ? "text-[10px] uppercase tracking-[0.14em] text-rose-300/70"
                      : "text-[10px] uppercase tracking-[0.14em] text-slate-600"
                  }
                >
                  Sesi {section.position}/{section.total}
                </p>


                <p
                  className={
                    urgent
                      ? "mt-0.5 font-mono text-xl font-bold tracking-tight text-rose-300"
                      : "mt-0.5 font-mono text-xl font-bold tracking-tight text-white"
                  }
                >
                  {timerReady
                    ? formatTime(
                        remaining
                      )
                    : "--:--"}
                </p>

              </div>

            </div>

          </div>


          {/* PROGRESS */}

          <div className="px-5 pb-4 sm:px-6">

            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">

              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-[width] duration-300"
                style={{
                  width:
                    `${progress}%`,
                }}
              />

            </div>

          </div>

        </header>

      </div>


      {/* ================================= */}
      {/* CONTENT */}
      {/* ================================= */}

      <div className="relative z-10 mx-auto grid max-w-7xl gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">

        {/* ================================= */}
        {/* QUESTION AREA */}
        {/* ================================= */}

        <section className="candidate-card min-w-0 p-5 sm:p-7">

          <div className="relative z-10">

            {/* QUESTION HEADER */}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

              <div className="flex flex-wrap items-center gap-2">

                <span className="candidate-badge px-3 py-1.5 text-xs font-semibold text-slate-300">
                  Soal {currentIndex + 1}
                </span>


                {policy.session.showQuestionCode && question.code && (

                  <span className="font-mono text-xs tracking-wider text-blue-300/70">
                    {question.code}
                  </span>

                )}

              </div>


              {/* FLAG */}

              <button
                type="button"
                disabled={
                  expired ||
                  flagSaving?.[
                    question.id
                  ] ||
                  submitting
                }
                onClick={() =>
                  toggleFlag(
                    question.id
                  )
                }
                className={
                  currentFlag
                    ? "rounded-[14px] border border-amber-400/25 bg-amber-400/[0.09] px-4 py-2.5 text-sm font-medium text-amber-200 transition hover:bg-amber-400/[0.13] disabled:cursor-not-allowed disabled:opacity-50"
                    : "candidate-button px-4 py-2.5 text-sm text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                }
              >

                {flagSaving?.[
                  question.id
                ]
                  ? "Menyimpan..."
                  : currentFlag
                    ? "★ Ditandai"
                    : "☆ Tandai Soal"}

              </button>

            </div>


            {/* QUESTION */}

            <div className="mt-6 rounded-[22px] border border-white/[0.055] bg-white/[0.022] p-5 sm:p-6">

              <p className="whitespace-pre-wrap text-base font-medium leading-8 text-slate-100 sm:text-lg">
                {
                  question.questionText
                }
              </p>

            </div>


            {/* ================================= */}
            {/* OPTIONS */}
            {/* ================================= */}

            <fieldset className="mt-6 space-y-3">

              <legend className="sr-only">
                Pilih jawaban untuk soal {currentIndex + 1}
              </legend>

              {question.options.map(
                (
                  option
                ) => {

                  const selected =
                    selectedAnswers?.[
                      question.id
                    ] ===
                    option.id;


                  const optionDisabled = expired || isSaving || submitting;

                  return (
                    <label
                      key={
                        option.id
                      }
                      data-selected={selected}
                      data-disabled={optionDisabled}
                      className={
                        selected
                          ? "candidate-answer-option group flex w-full items-start gap-4 rounded-[16px] border border-blue-400/35 bg-blue-400/[0.09] p-4 text-left transition sm:p-5"
                          : "candidate-answer-option group flex w-full items-start gap-4 rounded-[16px] border border-white/[0.065] bg-white/[0.022] p-4 text-left transition hover:border-white/[0.13] hover:bg-white/[0.04] sm:p-5"
                      }
                    >

                      {/* OPTION ID */}

                      <span
                        className={
                          selected
                            ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-300/30 bg-blue-400/[0.13] text-sm font-bold text-blue-200"
                            : "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/[0.09] bg-white/[0.035] text-sm font-bold text-slate-400 transition group-hover:text-slate-200"
                        }
                      >
                        {
                          option.id
                        }
                      </span>


                      {/* OPTION TEXT */}

                      <div className="min-w-0 flex-1 pt-2">

                        <p
                          className={
                            selected
                              ? "whitespace-pre-wrap text-sm leading-6 text-slate-100 sm:text-[15px]"
                              : "whitespace-pre-wrap text-sm leading-6 text-slate-300 sm:text-[15px]"
                          }
                        >
                          {
                            option.text
                          }
                        </p>

                      </div>


                      {/* SELECTED INDICATOR */}

                      <input
                        type="radio"
                        name={`answer-${question.id}`}
                        value={option.id}
                        checked={selected}
                        disabled={optionDisabled}
                        onChange={() => selectAnswer(question.id, option.id)}
                        className="candidate-answer-radio"
                      />

                    </label>
                  );
                }
              )}

            </fieldset>


            {/* ================================= */}
            {/* SAVE ERROR */}
            {/* ================================= */}

            {currentStatus ===
              "error" && (

              <div className="mt-5 rounded-[18px] border border-rose-400/15 bg-rose-400/[0.055] p-4">

                <div className="flex items-start gap-3">

                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-400/15 bg-rose-400/[0.08] text-xs font-bold text-rose-300">
                    !
                  </div>


                  <div>

                    <p className="text-sm font-medium text-rose-200">
                      Jawaban gagal disimpan
                    </p>


                    <p className="mt-1 text-xs leading-5 text-rose-200/70">
                      Pilih kembali jawaban untuk mencoba menyimpan ulang.
                    </p>

                  </div>

                </div>

              </div>

            )}


            {/* ================================= */}
            {/* SUBMIT ERROR */}
            {/* ================================= */}

            {submitError && (

              <div className="mt-5 rounded-[18px] border border-rose-400/15 bg-rose-400/[0.055] p-4">

                <div className="flex items-start gap-3">

                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-400/15 bg-rose-400/[0.08] text-xs font-bold text-rose-300">
                    !
                  </div>


                  <div className="flex-1">

                    <p className="text-sm font-medium text-rose-200">
                      Submit gagal
                    </p>


                    <p className="mt-1 text-xs leading-5 text-rose-200/70">
                      {submitError}
                    </p>


                    {(submitFailureKind === "global" || expired) && (

                      <button
                        type="button"
                        onClick={() => {
                          if (submitFailureKind === "global") {
                            void performGlobalSubmit();
                          } else {
                            void finishExam(true);
                          }
                        }}
                        className="candidate-button-primary mt-3 rounded-[12px] px-4 py-2.5 text-xs font-semibold"
                      >
                        Kirim Ulang
                      </button>

                    )}

                  </div>

                </div>

              </div>

            )}


            {/* ================================= */}
            {/* EXPIRED INFO */}
            {/* ================================= */}

            {expired &&
              !submitError && (

              <div className="mt-5 rounded-[18px] border border-amber-400/15 bg-amber-400/[0.045] p-4">

                <p className="text-sm font-medium text-amber-200">
                  Waktu ujian telah habis
                </p>


                <p className="mt-1 text-xs text-slate-500">
                  Sistem sedang memproses pengiriman jawaban secara otomatis.
                </p>

              </div>

            )}


            {/* ================================= */}
            {/* BOTTOM NAVIGATION */}
            {/* ================================= */}

            <div className="candidate-divider my-6" />


            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">

              {/* PREVIOUS */}

              <button
                type="button"
                disabled={
                  currentIndex ===
                    0 ||
                  !policy.session.allowPreviousQuestion ||
                  submitting
                }
                onClick={() =>
                  setCurrentIndex(
                    (index) =>
                      Math.max(
                        0,
                        index - 1
                      )
                  )
                }
                className="candidate-button px-5 py-3 text-sm font-medium text-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ← Sebelumnya
              </button>


              {/* NEXT / FINISH */}

              {currentIndex <
              questions.length -
                1 ? (

                <button
                  type="button"
                  disabled={
                    submitting
                  }
                  onClick={() =>
                    setCurrentIndex(
                      (index) =>
                        Math.min(
                          questions.length -
                            1,
                          index + 1
                        )
                    )
                  }
                  className="candidate-button-primary rounded-[14px] px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Berikutnya →
                </button>

              ) : (

                <button
                  type="button"
                  disabled={
                    submitting
                  }
                  onClick={() =>
                    finishExam(
                      false
                    )
                  }
                  className="rounded-[14px] border border-emerald-400/25 bg-emerald-400/[0.14] px-5 py-3 text-sm font-semibold text-emerald-100 shadow-[0_0_30px_rgba(16,185,129,0.08)] transition hover:bg-emerald-400/[0.2] disabled:cursor-not-allowed disabled:opacity-50"
                >

                  {submitting
                    ? "Mengirim..."
                    : section.position < section.total
                      ? "Selesaikan Sesi"
                      : "Selesaikan Ujian"}

                </button>

              )}

            </div>

          </div>

        </section>


        {/* ================================= */}
        {/* SIDEBAR */}
        {/* ================================= */}

        <aside className="h-fit lg:sticky lg:top-[150px]">

          <div className="candidate-card p-5">

            <div className="relative z-10">

              {/* HEADER */}

              <div className="flex items-center justify-between">

                <div>

                  <h2 className="font-semibold text-white">
                    Navigasi Soal
                  </h2>


                  <p className="mt-1 text-[11px] text-slate-600">
                    Pilih nomor soal
                  </p>

                </div>


                <span className="candidate-badge px-2.5 py-1 text-[10px] text-slate-400">
                  {answeredCount}/{questions.length}
                </span>

              </div>


              {/* ================================= */}
              {/* QUESTION GRID */}
              {/* ================================= */}

              <div className="mt-5 grid grid-cols-5 gap-2">

                {questions.map(
                  (
                    item,
                    index
                  ) => {

                    const answered =
                      Boolean(
                        selectedAnswers?.[
                          item.id
                        ]
                      );


                    const flagged =
                      Boolean(
                        flags?.[
                          item.id
                        ]
                      );


                    const active =
                      index ===
                      currentIndex;


                    return (
                      <button
                        key={
                          item.id
                        }
                        type="button"
                        disabled={
                          submitting ||
                          (!policy.session.allowPreviousQuestion && index < currentIndex)
                        }
                        onClick={() =>
                          setCurrentIndex(
                            index
                          )
                        }
                        className={
                          active
                            ? "aspect-square rounded-xl border border-blue-300/40 bg-blue-400/[0.14] text-sm font-semibold text-blue-100 shadow-[0_0_18px_rgba(59,130,246,0.08)] transition"
                            : flagged
                              ? "aspect-square rounded-xl border border-amber-400/25 bg-amber-400/[0.08] text-sm font-medium text-amber-200 transition hover:bg-amber-400/[0.13]"
                              : answered
                                ? "aspect-square rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/[0.11]"
                                : "aspect-square rounded-xl border border-white/[0.07] bg-white/[0.025] text-sm text-slate-400 transition hover:border-white/[0.14] hover:bg-white/[0.045]"
                        }
                      >
                        {index + 1}
                      </button>
                    );
                  }
                )}

              </div>


              {/* ================================= */}
              {/* LEGEND */}
              {/* ================================= */}

              <div className="mt-5 grid grid-cols-2 gap-2 text-[10px] text-slate-500">

                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm border border-blue-300/40 bg-blue-400/[0.14]" />
                  Aktif
                </div>


                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm border border-emerald-400/20 bg-emerald-400/[0.07]" />
                  Terjawab
                </div>


                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm border border-amber-400/25 bg-amber-400/[0.08]" />
                  Ditandai
                </div>


                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm border border-white/[0.1] bg-white/[0.025]" />
                  Kosong
                </div>

              </div>


              <div className="candidate-divider my-5" />


              {/* ================================= */}
              {/* SUMMARY */}
              {/* ================================= */}

              <div className="space-y-3 text-sm">

                <div className="flex items-center justify-between">

                  <span className="text-slate-500">
                    Terjawab
                  </span>

                  <span className="font-medium text-emerald-300">
                    {answeredCount}
                  </span>

                </div>


                <div className="flex items-center justify-between">

                  <span className="text-slate-500">
                    Ditandai
                  </span>

                  <span className="font-medium text-amber-300">
                    {flaggedCount}
                  </span>

                </div>


                <div className="flex items-center justify-between">

                  <span className="text-slate-500">
                    Kosong
                  </span>

                  <span className="font-medium text-slate-300">
                    {blankCount}
                  </span>

                </div>

              </div>


              {/* ================================= */}
              {/* PROGRESS */}
              {/* ================================= */}

              <div className="mt-5 rounded-2xl border border-white/[0.055] bg-white/[0.022] p-4">

                <div className="flex items-center justify-between">

                  <span className="text-[10px] uppercase tracking-wider text-slate-600">
                    Progress
                  </span>


                  <span className="text-xs font-medium text-slate-300">
                    {progress}%
                  </span>

                </div>


                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">

                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-[width] duration-300"
                    style={{
                      width:
                        `${progress}%`,
                    }}
                  />

                </div>

              </div>

            </div>

          </div>

        </aside>

      </div>


      {/* ================================= */}
      {/* SUBMITTING OVERLAY */}
      {/* ================================= */}

      {submitting && !confirmOpen && (

        <div className="fixed inset-0 z-[100] flex items-center justify-center candidate-overlay-backdrop px-6 backdrop-blur-md">

          <div className="candidate-card w-full max-w-sm p-7 text-center">

            <div className="relative z-10">

              <div className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-white/15 border-t-blue-300" />


              <p className="mt-5 font-medium text-white">
                Mengirim jawaban
              </p>


              <p className="mt-2 text-sm leading-6 text-slate-500">
                Jangan menutup halaman sampai proses selesai.
              </p>

            </div>

          </div>

        </div>

      )}

    
      <CandidateSubmitDialog
        open={confirmOpen}
        pending={submitting}
        title={section.position < section.total ? `Selesaikan sesi ${section.name}?` : "Kirim ujian sekarang?"}
        description={`${blankCount > 0 ? `Masih ada ${blankCount} soal kosong pada sesi ini. ` : ""}${
          section.position < section.total
            ? "Setelah sesi ditutup Anda tidak dapat kembali ke soal sesi ini. Timer total ujian tetap berjalan saat menunggu sesi berikutnya."
            : "Setelah dikirim, jawaban tidak dapat diubah lagi."
        }`}
        confirmLabel={section.position < section.total ? "Selesaikan sesi" : "Kirim ujian"}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void performSectionFinish(false)}
      />

      <PoweredBy show={branding.showPoweredBy} />
</main>
  );
}
