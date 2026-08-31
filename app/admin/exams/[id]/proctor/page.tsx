import Link from "next/link";
import { notFound } from "next/navigation";

import ConfirmSubmitButton from "@/app/admin/ui/ConfirmSubmitButton";
import { getExamPolicy, VIOLATION_LABELS, type ViolationKind } from "@/lib/exam-policy";
import { requireAdminReadAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminPageHero from "@/app/admin/ui/AdminPageHero";
import FlashNotice from "@/app/ui/FlashNotice";
import AutoRefresh from "./AutoRefresh";
import {
  extendSessionTime,
  finalizeOverdueSessions,
  forceSubmitAllActiveSessions,
  forceSubmitSession,
  releaseDeviceLock,
  resetSessionViolationCounter,
  setAssignmentExtraTime,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { error?: string; success?: string };

type SessionRow = {
  id: string;
  assignment_id: string;
  attempt_no: number;
  started_at: string | null;
  deadline_at: string | null;
  submitted_at: string | null;
  last_seen_at: string | null;
  status: string;
};

type EventRow = {
  id: string;
  session_id: string;
  candidate_id: string;
  event_type: string;
  policy_action: string | null;
  counted: boolean | null;
  detail: unknown;
  created_at: string;
};

type ResetRow = {
  session_id: string;
  created_at: string;
};

type CountedEventRow = {
  session_id: string;
  created_at: string;
};

function formatWib(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function relativeSeen(value: string | null) {
  if (!value) return "belum ada heartbeat";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds} dtk lalu`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} mnt lalu`;
  return `${Math.floor(minutes / 60)} jam lalu`;
}

export default async function ProctorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id: examId } = await params;
  const query = await searchParams;
  const { organizationId, organization } = await requireAdminReadAccess();
  const supabase = createAdminClient();

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, title, status, settings")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (examError) throw new Error("Gagal membaca ujian.");
  if (!exam) notFound();

  const { data: assignments, error: assignmentError } = await supabase
    .from("exam_assignments")
    .select("id, candidate_id, active, extra_time_minutes")
    .eq("exam_id", examId)
    .order("assigned_at", { ascending: true });

  if (assignmentError) throw new Error("Gagal membaca assignment ujian.");

  const assignmentRows = assignments ?? [];
  const candidateIds = [...new Set(assignmentRows.map((row) => String(row.candidate_id)))];
  const assignmentIds = assignmentRows.map((row) => String(row.id));

  const candidatesResult = candidateIds.length
    ? await supabase.from("candidates").select("id, candidate_code, display_name, email").in("id", candidateIds)
    : { data: [], error: null };

  const sessionsResult = assignmentIds.length
    ? await supabase
        .from("exam_sessions")
        .select("id, assignment_id, attempt_no, started_at, deadline_at, submitted_at, last_seen_at, status")
        .in("assignment_id", assignmentIds)
        .order("attempt_no", { ascending: false })
    : { data: [], error: null };

  if (candidatesResult.error) throw new Error("Gagal membaca peserta monitor.");
  if (sessionsResult.error) throw new Error("Gagal membaca sesi monitor.");

  const [eventResult, resetResult, countedEventResult] = await Promise.all([
    supabase
      .from("proctor_events")
      .select("id, session_id, candidate_id, event_type, policy_action, counted, detail, created_at")
      .eq("exam_id", examId)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("proctor_violation_resets")
      .select("session_id, created_at")
      .eq("exam_id", examId)
      .order("created_at", { ascending: false }),
    supabase
      .from("proctor_events")
      .select("session_id, created_at")
      .eq("exam_id", examId)
      .eq("counted", true),
  ]);

  const proctorReady = !eventResult.error && !resetResult.error && !countedEventResult.error;
  const events: EventRow[] = !eventResult.error
    ? (eventResult.data ?? []).map((row) => ({
        id: String(row.id),
        session_id: String(row.session_id),
        candidate_id: String(row.candidate_id),
        event_type: String(row.event_type),
        policy_action: row.policy_action ? String(row.policy_action) : null,
        counted: typeof row.counted === "boolean" ? row.counted : null,
        detail: row.detail,
        created_at: String(row.created_at),
      }))
    : [];

  const resets: ResetRow[] = !resetResult.error
    ? (resetResult.data ?? []).map((row) => ({
        session_id: String(row.session_id),
        created_at: String(row.created_at),
      }))
    : [];

  const latestResetBySession = new Map<string, string>();
  for (const reset of resets) {
    if (!latestResetBySession.has(reset.session_id)) latestResetBySession.set(reset.session_id, reset.created_at);
  }

  const countedEvents: CountedEventRow[] = !countedEventResult.error
    ? (countedEventResult.data ?? []).map((row) => ({
        session_id: String(row.session_id),
        created_at: String(row.created_at),
      }))
    : [];

  const activeCountBySession = new Map<string, number>();
  for (const event of countedEvents) {
    const resetAt = latestResetBySession.get(event.session_id);
    if (resetAt && new Date(event.created_at).getTime() <= new Date(resetAt).getTime()) continue;
    activeCountBySession.set(event.session_id, (activeCountBySession.get(event.session_id) ?? 0) + 1);
  }

  const candidateMap = new Map((candidatesResult.data ?? []).map((row) => [String(row.id), row]));
  const latestSessionByAssignment = new Map<string, SessionRow>();
  for (const row of sessionsResult.data ?? []) {
    const key = String(row.assignment_id);
    if (!latestSessionByAssignment.has(key)) {
      latestSessionByAssignment.set(key, {
        id: String(row.id),
        assignment_id: key,
        attempt_no: Number(row.attempt_no),
        started_at: row.started_at ? String(row.started_at) : null,
        deadline_at: row.deadline_at ? String(row.deadline_at) : null,
        submitted_at: row.submitted_at ? String(row.submitted_at) : null,
        last_seen_at: row.last_seen_at ? String(row.last_seen_at) : null,
        status: String(row.status),
      });
    }
  }

  const eventsBySession = new Map<string, EventRow[]>();
  for (const event of events) {
    const list = eventsBySession.get(event.session_id) ?? [];
    list.push(event);
    eventsBySession.set(event.session_id, list);
  }

  const monitored = assignmentRows.map((assignment) => {
    const session = latestSessionByAssignment.get(String(assignment.id)) ?? null;
    const candidate = candidateMap.get(String(assignment.candidate_id));
    const violations = session ? eventsBySession.get(session.id) ?? [] : [];
    return {
      assignmentId: String(assignment.id),
      active: Boolean(assignment.active),
      extraTimeMinutes: Number(assignment.extra_time_minutes ?? 0),
      candidateId: String(assignment.candidate_id),
      candidateCode: candidate?.candidate_code ? String(candidate.candidate_code) : "-",
      displayName: candidate?.display_name ? String(candidate.display_name) : "Peserta",
      email: candidate?.email ? String(candidate.email) : "-",
      session,
      violations,
      violationCount: session ? activeCountBySession.get(session.id) ?? 0 : 0,
      resetAt: session ? latestResetBySession.get(session.id) ?? null : null,
    };
  });

  const policy = getExamPolicy(exam.settings);
  const countedViolationTotal = monitored.reduce((total, row) => total + row.violationCount, 0);
  const activeSessions = monitored.filter((row) => row.session?.status === "ACTIVE").length;
  const submittedSessions = monitored.filter((row) => row.session?.status === "SUBMITTED").length;
  const highRisk = monitored.filter((row) => row.violationCount >= policy.security.violationLimit).length;

  return (
    <main className="admin-proctor-page mx-auto max-w-7xl px-6 py-10 sm:px-8">
      <AutoRefresh />
      <AdminPageHero
        eyebrow="Live Supervision"
        title="Proctor Monitor"
        organizationName={organization.name}
        status={<span className="r9-badge">Refresh 10 detik</span>}
        description={<span>{String(exam.title)} · Pantau sesi aktif, violation, deadline, device lock, dan tindakan pengawas.</span>}
        backHref="/admin/exams"
        backLabel="Kembali ke Ujian"
        actions={
          <>
            <Link href={`/admin/exams/${examId}/settings`} className="r9-button r9-button--secondary">Pengaturan & Punishment</Link>
            {proctorReady ? <Link href={`/admin/exams/${examId}/proctor/events/xlsx`} className="r9-button r9-button--secondary">Export Audit Excel</Link> : null}
          </>
        }
      />

      {query.error ? <FlashNotice tone="error" message={query.error} /> : null}
      {query.success ? <FlashNotice tone="success" message={query.success} /> : null}
      {!proctorReady ? (
        <div className="r9-surface mt-5 border-rose-400/30 bg-rose-400/[0.04] p-5">
          <p className="text-sm font-semibold text-rose-200">Database proctoring belum aktif</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">Jalankan <span className="font-mono text-slate-200">FINAL_SETUP.sql</span> di Supabase SQL Editor. Tanpa tabel ini, event pelanggaran browser tidak dapat disimpan permanen.</p>
        </div>
      ) : null}

      <section className="admin-summary-strip admin-proctor-summary mt-5 grid gap-0 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Peserta" value={monitored.length} />
        <Metric label="Sesi Active" value={activeSessions} accent="cyan" />
        <Metric label="Submitted" value={submittedSessions} accent="green" />
        <Metric label="Counted Violation" value={countedViolationTotal} accent={countedViolationTotal ? "amber" : undefined} />
        <Metric label="Limit Tercapai" value={highRisk} accent={highRisk ? "rose" : undefined} />
      </section>

      <div className="r9-surface-subtle mt-5 p-4 text-xs text-slate-500">
        Policy aktif: limit <span className="font-semibold text-slate-300">{policy.security.violationLimit}</span> violation · auto-submit <span className={policy.security.autoSubmitOnLimit ? "font-semibold text-rose-300" : "font-semibold text-slate-300"}>{policy.security.autoSubmitOnLimit ? "ON" : "OFF"}</span> · fullscreen <span className="font-semibold text-slate-300">{policy.security.requireFullscreen ? "WAJIB" : "opsional"}</span>.
      </div>

      <section className="r9-surface-subtle mt-4 flex flex-wrap items-center gap-2 p-4">
        <form action={finalizeOverdueSessions.bind(null, examId)}>
          <ConfirmSubmitButton
            message="Finalisasi semua sesi ACTIVE yang deadline-nya sudah lewat? Jawaban tersimpan akan langsung dinilai."
            className="r9-button r9-button--secondary"
          >
            Finalize Overdue
          </ConfirmSubmitButton>
        </form>
        <form action={forceSubmitAllActiveSessions.bind(null, examId)}>
          <ConfirmSubmitButton
            message="Submit SEMUA sesi ACTIVE sekarang? Gunakan saat pengawas benar-benar mengakhiri ujian untuk seluruh peserta."
            className="r9-button r9-button--danger"
          >
            Submit Semua Sesi Aktif
          </ConfirmSubmitButton>
        </form>
        <p className="text-[11px] leading-5 text-slate-600">Finalize Overdue hanya menyentuh sesi yang sudah melewati deadline. Submit Semua adalah emergency/end-exam control.</p>
      </section>

      <section className="mt-6 space-y-4">
        {monitored.map((row) => {
          const session = row.session;
          const violationCount = row.violationCount;
          const atLimit = violationCount >= policy.security.violationLimit;
          const lastEvent = row.violations[0];
          return (
            <article key={row.assignmentId} className={`admin-proctor-record r9-surface p-5 sm:p-6 ${atLimit ? "ring-1 ring-rose-400/15" : ""}`}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-cyan-300/75">{row.candidateCode}</span>
                    <SessionStatus status={session?.status ?? "NOT_STARTED"} />
                    {!row.active ? <span className="rounded-full bg-white/[0.04] px-2 py-1 text-[11px] text-slate-600">ASSIGNMENT OFF</span> : null}
                  </div>
                  <h2 className="mt-2 truncate text-lg font-semibold text-slate-100">{row.displayName}</h2>
                  <p className="mt-1 text-[11px] text-slate-600">{row.email}</p>
                </div>

                <div className="admin-proctor-meta grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[520px]">
                  <Small label="Attempt" value={session ? String(session.attempt_no) : "-"} />
                  <Small label="Violation" value={String(violationCount)} danger={atLimit} />
                  <Small label="Last seen" value={session ? relativeSeen(session.last_seen_at) : "-"} />
                  <Small label="Deadline" value={session ? formatWib(session.deadline_at) : "-"} />
                </div>
              </div>

              {lastEvent ? (
                <div className={`mt-4 rounded-[16px] border p-4 ${atLimit ? "border-rose-400/14 bg-rose-400/[0.04]" : "border-amber-400/12 bg-amber-400/[0.035]"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={`text-xs font-semibold ${atLimit ? "text-rose-200" : "text-amber-200"}`}>Terakhir: {VIOLATION_LABELS[lastEvent.event_type as ViolationKind] ?? lastEvent.event_type}</p>
                    <span className="text-[11px] text-slate-600">{formatWib(lastEvent.created_at)}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">{violationCount} / {policy.security.violationLimit} event aktif untuk punishment.{row.resetAt ? ` Counter direset ${formatWib(row.resetAt)}; audit lama tetap tersimpan.` : ""}</p>
                </div>
              ) : null}

              {session?.status === "ACTIVE" ? (
                <div className="mt-4 flex flex-wrap items-end gap-2">
                  <form action={extendSessionTime.bind(null, examId, session.id)} className="flex items-end gap-2">
                    <label><span className="r9-field-label mb-1">Tambah waktu</span><input name="minutes" type="number" min="1" max="120" defaultValue="10" className="r9-input w-20" /></label>
                    <button className="r9-button r9-button--secondary">+ Menit</button>
                  </form>
                  {proctorReady && violationCount > 0 ? (
                    <form action={resetSessionViolationCounter.bind(null, examId, session.id)}>
                      <ConfirmSubmitButton message={`Reset counter ${violationCount} violation untuk ${row.displayName}? Audit historis tidak akan dihapus.`} className="r9-button r9-button--secondary">Reset Counter</ConfirmSubmitButton>
                    </form>
                  ) : null}
                  <form action={releaseDeviceLock.bind(null, examId, session.id)}>
                    <ConfirmSubmitButton message={`Lepas device lock untuk ${row.displayName}? Gunakan ini jika peserta perlu pindah laptop/browser.`} className="r9-button r9-button--secondary">Release Device</ConfirmSubmitButton>
                  </form>
                  <form action={forceSubmitSession.bind(null, examId, session.id)}>
                    <ConfirmSubmitButton message={`Submit paksa sesi ${row.displayName}? Jawaban yang tersimpan akan langsung dinilai.`} className="r9-button r9-button--danger">Submit Paksa</ConfirmSubmitButton>
                  </form>
                </div>
              ) : null}

              {session?.status !== "ACTIVE" ? (
                <form action={setAssignmentExtraTime.bind(null, examId, row.assignmentId)} className="mt-4 flex items-end gap-2">
                  <label><span className="r9-field-label mb-1">Extra time sebelum start</span><input name="extra_time_minutes" type="number" min="0" max="240" defaultValue={row.extraTimeMinutes} className="r9-input w-24" /></label>
                  <button className="r9-button r9-button--secondary">Simpan Extra Time</button>
                </form>
              ) : null}
            </article>
          );
        })}
      </section>

      {events.length ? (
        <section className="r9-surface mt-6 p-6">
          <h2 className="text-lg font-semibold text-slate-100">Audit Event Terbaru</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wider text-slate-700"><tr><th className="pb-3 pr-4">Waktu</th><th className="pb-3 pr-4">Peserta</th><th className="pb-3 pr-4">Event</th><th className="pb-3">Detail</th></tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {events.slice(0, 80).map((event) => {
                  const candidate = candidateMap.get(event.candidate_id);
                  return <tr key={event.id}><td className="py-3 pr-4 text-slate-500">{formatWib(event.created_at)}</td><td className="py-3 pr-4 text-slate-300">{candidate?.display_name ?? event.candidate_id.slice(0, 8)}</td><td className="py-3 pr-4 font-medium text-amber-200">{VIOLATION_LABELS[event.event_type as ViolationKind] ?? event.event_type}<span className="ml-2 text-[11px] font-normal text-slate-600">{event.policy_action ?? "LEGACY"}</span></td><td className="max-w-[420px] truncate py-3 font-mono text-[11px] text-slate-600">{JSON.stringify(event.detail ?? {})}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: "cyan" | "green" | "amber" | "rose" }) {
  const tone = accent === "cyan" ? "text-cyan-200" : accent === "green" ? "text-emerald-200" : accent === "amber" ? "text-amber-200" : accent === "rose" ? "text-rose-200" : "text-slate-100";
  return <div className="admin-proctor-metric r9-surface p-5"><p className="r9-kicker">{label}</p><p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p></div>;
}

function Small({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="admin-proctor-meta-item r9-surface-subtle p-3"><p className="r9-kicker">{label}</p><p className={`mt-1 truncate text-[11px] font-medium ${danger ? "text-rose-200" : "text-slate-300"}`}>{value}</p></div>;
}

function SessionStatus({ status }: { status: string }) {
  const toneClass = status === "ACTIVE" ? "r9-badge--success" : status === "SUBMITTED" ? "r9-badge--accent" : "";
  return <span className={`r9-badge ${toneClass}`}>{status}</span>;
}
