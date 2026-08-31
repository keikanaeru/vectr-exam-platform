"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { ExamPolicy } from "@/lib/exam-policy";
import CandidateThemeToggle from "@/app/candidate/ui/CandidateThemeToggle";
import CandidateBrand from "@/app/candidate/ui/CandidateBrand";
import PoweredBy from "@/app/candidate/ui/PoweredBy";
import ExamGuard from "./ExamGuard";
import { startExamSection, submitExam } from "./actions";

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function SectionTransition({
  examId,
  policy,
  globalDeadlineAt,
  completedSectionName,
  nextSection,
  branding,
}: {
  examId: string;
  policy: ExamPolicy;
  globalDeadlineAt: string;
  completedSectionName?: string | null;
  nextSection: { id: string; name: string; code: string; durationMinutes: number; position: number; total: number };
  branding: { displayName: string; logoUrl: string | null; showPoweredBy: boolean };
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(0);
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const finalizingRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((new Date(globalDeadlineAt).getTime() - Date.now()) / 1000));
      setRemaining(seconds);
      setReady(true);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [globalDeadlineAt]);

  useEffect(() => {
    if (!ready || remaining > 0 || finalizingRef.current) return;
    finalizingRef.current = true;
    void submitExam(examId)
      .then(() => {
        router.replace(`/candidate/exam/${examId}/result`);
        router.refresh();
      })
      .catch(() => {
        finalizingRef.current = false;
        setError("Waktu total ujian habis, tetapi submit otomatis belum berhasil. Muat ulang halaman.");
      });
  }, [examId, ready, remaining, router]);

  async function startNext() {
    if (starting || remaining <= 0) return;
    setStarting(true);
    setError("");
    try {
      const result = await startExamSection(examId, nextSection.id);
      if (result.finished) {
        router.replace(`/candidate/exam/${examId}/result`);
      } else {
        router.refresh();
      }
    } catch (cause) {
      console.error(cause);
      setError(cause instanceof Error ? cause.message : "Sesi berikutnya gagal dimulai.");
      setStarting(false);
    }
  }

  return (
    <main className="candidate-surface relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <ExamGuard examId={examId} policy={policy} />
      <div className="fixed right-4 top-4 z-[80]"><CandidateThemeToggle /></div>
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-blue-500/[0.06] blur-[120px]" />
        <div className="absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-violet-500/[0.055] blur-[120px]" />
      </div>

      <section className="candidate-card relative z-10 w-full max-w-2xl p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <CandidateBrand displayName={branding.displayName} logoUrl={branding.logoUrl} subtitle="Pergantian Sesi" />
          <div className="rounded-[16px] border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.14em] text-rose-300/70">Sisa Waktu Ujian</p>
            <p className="mt-1 font-mono text-xl font-bold text-rose-200">{ready ? formatTime(remaining) : "--:--"}</p>
          </div>
        </div>

        <div className="candidate-divider my-6" />

        {completedSectionName ? (
          <div className="rounded-[18px] border border-emerald-400/15 bg-emerald-400/[0.045] p-4">
            <p className="text-xs font-semibold text-emerald-200">Sesi sebelumnya selesai</p>
            <p className="mt-1 text-sm text-slate-400">{completedSectionName}</p>
          </div>
        ) : null}

        <div className="mt-4 rounded-[22px] border border-cyan-400/15 bg-cyan-400/[0.035] p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="candidate-badge px-3 py-1.5 text-[11px] font-semibold text-cyan-100">SESI {nextSection.position}/{nextSection.total}</span>
            <span className="font-mono text-[11px] text-cyan-300/60">{nextSection.code}</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">{nextSection.name}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Batas waktu sesi ini {nextSection.durationMinutes} menit. Timer sesi baru dimulai setelah Anda menekan tombol di bawah.</p>
        </div>

        <div className="mt-5 rounded-[18px] border border-amber-400/15 bg-amber-400/[0.035] p-4">
          <p className="text-xs font-semibold text-amber-200">Timer ujian utama tidak berhenti</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">Gunakan jeda ini hanya untuk memastikan Anda siap. Waktu total ujian terus berkurang meskipun sesi berikutnya belum dimulai.</p>
        </div>

        {error ? <p className="mt-4 rounded-[15px] border border-rose-400/15 bg-rose-400/[0.05] p-4 text-xs text-rose-200">{error}</p> : null}

        <button
          type="button"
          onClick={startNext}
          disabled={starting || !ready || remaining <= 0}
          className="candidate-button-primary mt-6 w-full rounded-[15px] px-5 py-3.5 text-sm font-semibold disabled:opacity-50"
        >
          {starting ? "Menyiapkan sesi..." : `Saya Siap · Mulai ${nextSection.name}`}
        </button>
        <PoweredBy show={branding.showPoweredBy} />
      </section>
    </main>
  );
}
