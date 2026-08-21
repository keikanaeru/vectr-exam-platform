import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminReadAccess } from "@/lib/organization-subscription";
import GlassSelect from "@/app/admin/ui/GlassSelect";
import ConfirmSubmitButton from "@/app/admin/ui/ConfirmSubmitButton";
import FlashNotice from "@/app/ui/FlashNotice";
import { getExamPolicy } from "@/lib/exam-policy";

import {
  createExam,
  activateExam,
  closeExam,
  reopenExam,
  generateExamAccessCodes,
  syncExamParticipants,
  updateExamSchedule,
  deleteExam,
} from "./actions";
import ExamShareActions from "./ExamShareActions";
import ExamDateTimeFields from "./ExamDateTimeFields";
import ExamSectionsBuilder from "./ExamSectionsBuilder";
import ExamTotalDurationInput from "./ExamTotalDurationInput";

export const dynamic = "force-dynamic";

type SearchParams = { error?: string; success?: string };

type AssignmentRow = {
  exam_id: string;
  candidate_id: string;
  access_code_hash: string | null;
  access_code_ciphertext: string | null;
  access_code_generated_at: string | null;
  active: boolean;
};

function formatWib(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function nowWibLabel() {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
}

export default async function ExamsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organizationId, organization } = await requireAdminReadAccess();
  const supabase = createAdminClient();

  const [modulesResult, batchesResult, candidatesResult, examsResult] = await Promise.all([
    supabase.from("modules").select("id, code, name, default_duration_minutes, status").eq("organization_id", organizationId).order("name"),
    supabase.from("batches").select("id, code, name, status").eq("organization_id", organizationId).order("name"),
    supabase.from("candidates").select("id, batch_id, active").eq("organization_id", organizationId),
    supabase.from("exams").select("id, module_id, batch_id, title, login_open_at, starts_at, hard_close_at, duration_minutes, status, settings, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
  ]);

  if (modulesResult.error) throw new Error("Gagal membaca modul ujian.");
  if (batchesResult.error) throw new Error("Gagal membaca batch ujian.");
  if (candidatesResult.error) throw new Error("Gagal membaca peserta ujian.");
  if (examsResult.error) throw new Error("Gagal membaca daftar ujian.");

  const modules = modulesResult.data ?? [];
  const batches = batchesResult.data ?? [];
  const candidates = candidatesResult.data ?? [];
  const exams = examsResult.data ?? [];
  const examIds = exams.map((exam) => String(exam.id));

  const moduleIds = modules.map(
    (module) => String(module.id)
  );

  const [
    assignmentsResult,
    scheduledEmailResult,
    sectionResult,
    activeQuestionResult,
  ] = await Promise.all([
    examIds.length
      ? supabase
          .from("exam_assignments")
          .select(
            "exam_id, candidate_id, access_code_hash, access_code_ciphertext, access_code_generated_at, active"
          )
          .in("exam_id", examIds)
          .eq("active", true)
      : Promise.resolve({ data: [], error: null }),

    examIds.length
      ? supabase
          .from("exam_email_deliveries")
          .select("exam_id")
          .in("exam_id", examIds)
          .eq("status", "SCHEDULED")
      : Promise.resolve({ data: [], error: null }),

    examIds.length
      ? supabase
          .from("exam_sections")
          .select(
            "id, exam_id, module_id, order_index, duration_minutes"
          )
          .in("exam_id", examIds)
          .order("order_index", { ascending: true })
      : Promise.resolve({ data: [], error: null }),

    moduleIds.length
      ? supabase
          .from("questions")
          .select("module_id")
          .in("module_id", moduleIds)
          .eq("status", "ACTIVE")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (assignmentsResult.error) {
    throw new Error(
      "Gagal membaca assignment peserta ujian."
    );
  }

  if (scheduledEmailResult.error) {
    throw new Error(
      "Gagal membaca status email peserta terjadwal."
    );
  }

  if (sectionResult.error) {
    throw new Error(
      "Gagal membaca sesi modul ujian."
    );
  }

  if (activeQuestionResult.error) {
    throw new Error(
      "Gagal membaca kesiapan soal ujian."
    );
  }

  const assignments: AssignmentRow[] = (
    assignmentsResult.data ?? []
  ).map((row) => ({
    exam_id: String(row.exam_id),
    candidate_id: String(row.candidate_id),
    access_code_hash: row.access_code_hash
      ? String(row.access_code_hash)
      : null,
    access_code_ciphertext: row.access_code_ciphertext
      ? String(row.access_code_ciphertext)
      : null,
    access_code_generated_at: row.access_code_generated_at
      ? String(row.access_code_generated_at)
      : null,
    active: Boolean(row.active),
  }));

  const assignmentsByExam =
    new Map<string, AssignmentRow[]>();

  for (const assignment of assignments) {
    const current =
      assignmentsByExam.get(assignment.exam_id) ?? [];

    current.push(assignment);
    assignmentsByExam.set(
      assignment.exam_id,
      current
    );
  }

  const scheduledEmailCountByExam =
    new Map<string, number>();

  for (const row of scheduledEmailResult.data ?? []) {
    const key = String(row.exam_id);

    scheduledEmailCountByExam.set(
      key,
      (scheduledEmailCountByExam.get(key) ?? 0) + 1
    );
  }

  const sectionsByExam = new Map<
    string,
    Array<{
      id: string;
      module_id: string;
      order_index: number;
      duration_minutes: number;
    }>
  >();

  for (const row of sectionResult.data ?? []) {
    const key = String(row.exam_id);
    const current = sectionsByExam.get(key) ?? [];

    current.push({
      id: String(row.id),
      module_id: String(row.module_id),
      order_index: Number(row.order_index),
      duration_minutes: Number(row.duration_minutes),
    });

    sectionsByExam.set(key, current);
  }

  const activeQuestionCountByModule =
    new Map<string, number>();

  for (const row of activeQuestionResult.data ?? []) {
    const key = String(row.module_id);

    activeQuestionCountByModule.set(
      key,
      (activeQuestionCountByModule.get(key) ?? 0) + 1
    );
  }

  const moduleMap = new Map(modules.map((module) => [String(module.id), module]));
  const batchMap = new Map(batches.map((batch) => [String(batch.id), batch]));
  const selectableModules = modules.filter((module) => module.status !== "INACTIVE");
  const activeBatches = batches.filter(
    (batch) => batch.status === "ACTIVE"
  );

  const activeCandidateIdsByBatch =
    new Map<string, Set<string>>();

  for (const candidate of candidates) {
    if (!candidate.active) continue;

    const key = String(candidate.batch_id);
    const current =
      activeCandidateIdsByBatch.get(key) ??
      new Set<string>();

    current.add(String(candidate.id));
    activeCandidateIdsByBatch.set(key, current);
  }

  function batchCount(batchId: string) {
    return activeCandidateIdsByBatch.get(batchId)?.size ?? 0;
  }

  function credentialStats(
    examId: string,
    batchId: string
  ) {
    const rows =
      assignmentsByExam.get(examId) ?? [];

    const batchCandidateIds =
      activeCandidateIdsByBatch.get(batchId) ??
      new Set<string>();
    const assignmentCandidateIds = new Set(rows.map((row) => row.candidate_id));
    const missing = [...batchCandidateIds].filter((candidateId) => !assignmentCandidateIds.has(candidateId)).length;
    const stale = [...assignmentCandidateIds].filter((candidateId) => !batchCandidateIds.has(candidateId)).length;
    const inCurrentBatch = rows.filter((row) => batchCandidateIds.has(row.candidate_id));
    const ready = inCurrentBatch.filter((row) => row.access_code_hash && row.access_code_ciphertext).length;
    const pending = Math.max(inCurrentBatch.length - ready, 0);
    const inSync = missing === 0 && stale === 0;
    return {
      assigned: rows.length,
      currentAssigned: inCurrentBatch.length,
      ready,
      pending,
      missing,
      stale,
      mismatch: missing + stale,
      inSync,
      allReady: inCurrentBatch.length > 0 && ready === inCurrentBatch.length && inSync,
    };
  }

  const activeCount = exams.filter((exam) => exam.status === "ACTIVE").length;
  const draftCount = exams.filter((exam) => exam.status === "DRAFT").length;
  const closedCount = exams.filter((exam) => exam.status === "CLOSED").length;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-8">
      <section className="liquid-enter">
        <div className="admin-page-hero relative overflow-hidden rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-7 sm:p-9">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2"><span className="liquid-badge px-3 py-1.5 text-xs text-slate-300">{organization.name}</span><span className="text-xs text-slate-600">Kontrol ujian</span></div>
              <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">Ujian</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Buat, edit jadwal, sinkronkan peserta, generate credential, buka/tutup kembali akses, dan export hasil dari satu halaman.</p>
            </div>
            <div className="rounded-[18px] border border-cyan-400/10 bg-cyan-400/[0.035] px-4 py-3"><p className="text-[11px] uppercase tracking-wider text-slate-600">Sekarang</p><p className="mt-1 text-xs font-medium text-cyan-100">{nowWibLabel()} WIB</p></div>
          </div>
        </div>
      </section>

      {params.error ? <FlashNotice tone="error" message={params.error} /> : null}
      {params.success ? <FlashNotice tone="success" message={params.success} /> : null}

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total" value={exams.length} />
        <Metric label="Draft" value={draftCount} />
        <Metric label="Active" value={activeCount} accent />
        <Metric label="Closed" value={closedCount} />
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-[430px_1fr]">
        <form action={createExam} className="liquid-card h-fit p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-violet-300/60">New Exam</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Buat Ujian</h2>
          <p className="mt-2 text-xs leading-5 text-slate-600">Assignment awal dibuat dari peserta aktif pada batch. Peserta yang diimpor sesudahnya bisa disinkronkan otomatis.</p>

          <label className="mt-5 block"><span className="mb-2 block text-xs text-slate-400">Judul Ujian</span><input name="title" required placeholder="Brevet 2027 - Try Out 1" className="field" /></label>

          <ExamSectionsBuilder
            initialTotalDuration={60}
            modules={selectableModules.map((module) => ({
              id: String(module.id),
              code: String(module.code),
              name: String(module.name),
              status: String(module.status),
              defaultDuration: Number(module.default_duration_minutes ?? 60),
            }))}
          />
          <div className="mt-4"><label className="mb-2 block text-xs text-slate-400">Batch Peserta</label><GlassSelect name="batch_id" required placeholder="Pilih batch peserta" options={activeBatches.map((batch) => ({ value: String(batch.id), label: String(batch.name), description: `${batch.code} · ${batchCount(String(batch.id))} peserta aktif` }))} /></div>

          <ExamDateTimeFields />
          <button disabled={!selectableModules.length || !activeBatches.length} className="liquid-button-primary mt-5 w-full rounded-[14px] px-4 py-3 text-sm font-semibold disabled:opacity-40">Buat sebagai Draft</button>
        </form>

        <div className="space-y-5">
          {exams.length === 0 ? <div className="liquid-card p-8 text-center text-sm text-slate-500">Belum ada ujian.</div> : null}

          {exams.map((exam) => {
            const examId = String(exam.id);
            const examSections = sectionsByExam.get(examId) ?? [{ id: `legacy-${examId}`, module_id: String(exam.module_id), order_index: 1, duration_minutes: Number(exam.duration_minutes) }];
            const sectionNames = examSections.map((section) => moduleMap.get(String(section.module_id))?.name ?? "Modul");
            const batch = batchMap.get(String(exam.batch_id));
            const totalBatch = batchCount(String(exam.batch_id));
            const credential = credentialStats(examId, String(exam.batch_id));
            const syncMissing = credential.missing;
            const syncStale = credential.stale;
            const syncMismatch = credential.mismatch;
            const closePassed = new Date(String(exam.hard_close_at)).getTime() <= Date.now();
            const scheduledEmailCount = scheduledEmailCountByExam.get(examId) ?? 0;
            const policy = getExamPolicy(exam.settings);
            const readinessBlockers: string[] = [];
            const sectionDurationTotal = examSections.reduce((sum, section) => sum + Number(section.duration_minutes || 0), 0);
            if (!batch || String(batch.status) !== "ACTIVE") readinessBlockers.push("Batch peserta belum aktif atau tidak ditemukan.");
            if (totalBatch < 1) readinessBlockers.push("Batch belum memiliki peserta aktif.");
            if (!examSections.length) readinessBlockers.push("Ujian belum memiliki sesi modul.");
            if (sectionDurationTotal > Number(exam.duration_minutes)) readinessBlockers.push(`Total batas sesi ${sectionDurationTotal} menit melebihi durasi total ${exam.duration_minutes} menit.`);
            for (const section of examSections) {
              const sectionModule = moduleMap.get(String(section.module_id));
              if (!sectionModule || String(sectionModule.status) !== "ACTIVE") readinessBlockers.push(`Modul ${sectionModule?.name ?? section.module_id} belum ACTIVE.`);
              if ((activeQuestionCountByModule.get(String(section.module_id)) ?? 0) < 1) readinessBlockers.push(`Modul ${sectionModule?.name ?? section.module_id} belum memiliki soal ACTIVE.`);
            }
            const loginMs = new Date(String(exam.login_open_at)).getTime();
            const startMs = new Date(String(exam.starts_at)).getTime();
            const closeMs = new Date(String(exam.hard_close_at)).getTime();
            if (![loginMs, startMs, closeMs].every(Number.isFinite)) readinessBlockers.push("Jadwal ujian belum valid.");
            else {
              if (loginMs > startMs) readinessBlockers.push("Login Dibuka harus sebelum atau sama dengan Ujian Mulai.");
              if (closeMs <= startMs) readinessBlockers.push("Hard Close harus setelah Ujian Mulai.");
              if (closeMs <= Date.now()) readinessBlockers.push("Hard Close sudah lewat.");
            }
            const examReady = readinessBlockers.length === 0;

            return (
              <article key={examId} className="liquid-card overflow-hidden">
                <div className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><Status status={String(exam.status)} /><span className="font-mono text-[11px] text-slate-700">{examId.slice(0, 8)}</span></div>
                      <h3 className="mt-3 text-xl font-semibold text-white">{exam.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">{sectionNames.join(" → ")} · {batch?.name ?? "Batch tidak ditemukan"}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <Mini label="Batch Peserta" value={totalBatch} />
                      <Mini label="Assigned" value={credential.assigned} warn={syncMismatch > 0} />
                      <Mini label="Ready" value={credential.ready} good={credential.allReady} />
                    </div>
                  </div>

                  {syncMismatch > 0 ? <div className="mt-4 rounded-[16px] border border-amber-400/15 bg-amber-400/[0.04] p-4"><p className="text-xs font-semibold text-amber-200">Assignment peserta perlu disinkronkan</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{syncMissing > 0 ? `${syncMissing} peserta batch belum masuk ujian. ` : ""}{syncStale > 0 ? `${syncStale} assignment lama sudah tidak sesuai batch aktif. ` : ""}Klik Sinkronkan Peserta; pada ujian ACTIVE credential peserta baru dibuat/dirapikan otomatis.</p></div> : null}
                  {closePassed ? <div className="mt-4 rounded-[16px] border border-rose-400/15 bg-rose-400/[0.04] p-4"><p className="text-xs font-semibold text-rose-200">Hard Close sudah lewat</p><p className="mt-1 text-[11px] leading-5 text-slate-500">Tautan peserta otomatis menolak login. Edit jadwal ke masa depan bila ujian masih ingin digunakan.</p></div> : null}

                  {exam.status === "DRAFT" ? (
                    <div className={`mt-4 rounded-[18px] border p-4 ${examReady ? "border-emerald-400/15 bg-emerald-400/[0.035]" : "border-amber-400/15 bg-amber-400/[0.035]"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className={`text-xs font-semibold ${examReady ? "text-emerald-200" : "text-amber-200"}`}>Kesiapan Ujian</p>
                          <p className="mt-1 text-[11px] leading-5 text-slate-500">Aktivasi hanya dibuka ketika modul, soal, batch, peserta, durasi, dan jadwal sudah konsisten.</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${examReady ? "bg-emerald-400/[0.08] text-emerald-300" : "bg-amber-400/[0.08] text-amber-300"}`}>{examReady ? "SIAP" : `${readinessBlockers.length} BLOCKER`}</span>
                      </div>
                      {readinessBlockers.length ? <ul className="mt-3 space-y-1.5 text-[11px] leading-5 text-slate-500">{readinessBlockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}</ul> : <p className="mt-3 text-[11px] text-emerald-200/70">Semua pemeriksaan preflight lolos. Ujian siap diaktifkan.</p>}
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Schedule label="Login Dibuka" value={formatWib(exam.login_open_at ? String(exam.login_open_at) : null)} />
                    <Schedule label="Ujian Mulai" value={formatWib(exam.starts_at ? String(exam.starts_at) : null)} />
                    <Schedule label="Hard Close" value={formatWib(exam.hard_close_at ? String(exam.hard_close_at) : null)} danger={closePassed} />
                    <Schedule label="Timer Utama" value={`${exam.duration_minutes} menit · mencakup ${examSections.length} sesi`} />
                  </div>

                  {scheduledEmailCount > 0 ? (
                    <div className="mt-5 rounded-[18px] border border-violet-400/15 bg-violet-400/[0.035] p-4">
                      <p className="text-xs font-semibold text-violet-200">Jadwal ujian dikunci oleh {scheduledEmailCount} email terjadwal</p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">Batalkan campaign terjadwal di menu Komunikasi sebelum mengubah judul, batch, modul, atau jadwal agar isi email peserta tidak berbeda dari konfigurasi ujian.</p>
                    </div>
                  ) : null}

                  <details className="mt-5 rounded-[18px] border border-white/[0.055] bg-black/10 p-4">
                    <summary className="cursor-pointer list-none text-xs font-semibold text-slate-300">Edit Judul & Jadwal</summary>
                    <form action={updateExamSchedule.bind(null, examId)} className="mt-4">
                      <label className="block"><span className="mb-2 block text-xs text-slate-400">Judul</span><input name="title" defaultValue={String(exam.title)} required className="field" /></label>
                      {exam.status === "DRAFT" ? (
                        <>
                          <ExamSectionsBuilder
                            initialTotalDuration={Number(exam.duration_minutes)}
                            modules={modules.filter((item) => item.status !== "INACTIVE" || examSections.some((section) => String(section.module_id) === String(item.id))).map((module) => ({
                              id: String(module.id), code: String(module.code), name: String(module.name), status: String(module.status), defaultDuration: Number(module.default_duration_minutes ?? 60),
                            }))}
                            initialSections={examSections.map((section) => ({ id: section.id, moduleId: String(section.module_id), durationMinutes: Number(section.duration_minutes) }))}
                          />
                          <div className="mt-3"><label className="mb-2 block text-xs text-slate-400">Batch Peserta</label><GlassSelect name="batch_id" defaultValue={String(exam.batch_id)} placeholder="Pilih batch peserta" options={activeBatches.map((item) => ({ value: String(item.id), label: String(item.name), description: `${item.code} · ${batchCount(String(item.id))} peserta` }))} /></div>
                        </>
                      ) : null}
                      {exam.status !== "DRAFT" ? (
                        <ExamTotalDurationInput
                          defaultValue={Number(exam.duration_minutes)}
                          minimum={examSections.reduce((sum, section) => sum + Number(section.duration_minutes || 0), 0)}
                        />
                      ) : null}
                      <ExamDateTimeFields compact initialLoginOpenAt={String(exam.login_open_at)} initialStartsAt={String(exam.starts_at)} initialHardCloseAt={String(exam.hard_close_at)} />
                      <button disabled={scheduledEmailCount > 0} className="liquid-button mt-4 rounded-[12px] px-4 py-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40">{scheduledEmailCount > 0 ? "Batalkan Email Terjadwal Dulu" : "Simpan Jadwal"}</button>
                    </form>
                  </details>

                  <div className="mt-5 grid gap-3 lg:grid-cols-2">
                    <form action={syncExamParticipants.bind(null, examId)}>
                      <button className="liquid-button w-full rounded-[14px] px-4 py-3 text-xs font-semibold">
                        ↻ {exam.status === "ACTIVE" ? "Sinkronkan Peserta & Credential" : "Sinkronkan Peserta"} {syncMismatch ? `(${syncMismatch} perubahan)` : ""}
                      </button>
                    </form>
                    {exam.status === "ACTIVE" ? (
                      credential.pending > 0 || syncMismatch > 0 ? (
                        <form action={generateExamAccessCodes.bind(null, examId)}>
                          <button className="liquid-button-primary w-full rounded-[14px] px-4 py-3 text-xs font-semibold">Buat / Perbaiki Credential</button>
                        </form>
                      ) : (
                        <div className="flex items-center justify-center gap-2 rounded-[14px] border border-emerald-400/12 bg-emerald-400/[0.035] px-4 py-3 text-xs font-semibold text-emerald-200">
                          <span className="h-2 w-2 rounded-full bg-emerald-300" />
                          Credential lengkap
                        </div>
                      )
                    ) : (
                      <div className="rounded-[14px] border border-white/[0.055] bg-white/[0.02] px-4 py-3 text-center text-xs text-slate-600">Aktifkan ujian untuk membuat kode akses</div>
                    )}
                  </div>

                  <div className="mt-5 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-[18px] border border-white/[0.055] bg-white/[0.018] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div><p className="text-xs font-semibold text-slate-300">Link & Credential Peserta</p><p className="mt-1 text-[11px] text-slate-600">Bagikan akses dan unduh daftar credential.</p></div>
                        <span className={`text-[11px] font-semibold ${credential.allReady && credential.inSync ? "text-emerald-300" : "text-amber-300"}`}>{credential.ready}/{totalBatch} READY</span>
                      </div>
                      <div className="mt-3"><ExamShareActions examId={examId} /></div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <DownloadLink href={`/admin/exams/${examId}/credentials/docx`} label="Word" ready={credential.allReady && credential.inSync} />
                        <DownloadLink href={`/admin/exams/${examId}/credentials/pdf`} label="PDF" ready={credential.allReady && credential.inSync} />
                        <DownloadLink href={`/admin/exams/${examId}/credentials/xlsx`} label="Excel" ready={credential.allReady && credential.inSync} />
                      </div>
                    </div>

                    <div className="rounded-[18px] border border-emerald-400/10 bg-emerald-400/[0.025] p-4">
                      <div><p className="text-xs font-semibold text-emerald-100">Hasil Ujian</p><p className="mt-1 text-[11px] text-slate-600">Rekap nilai keseluruhan dan nilai tiap modul/sesi.</p></div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <Link href={`/admin/exams/${examId}/results/docx`} className="liquid-button flex items-center justify-center rounded-[12px] px-3 py-2.5 text-xs font-semibold text-slate-300">Word</Link>
                        <Link href={`/admin/exams/${examId}/results/pdf`} className="liquid-button flex items-center justify-center rounded-[12px] px-3 py-2.5 text-xs font-semibold text-slate-300">PDF</Link>
                        <Link href={`/admin/exams/${examId}/results/xlsx`} className="liquid-button flex items-center justify-center rounded-[12px] px-3 py-2.5 text-xs font-semibold text-slate-300">Excel</Link>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Link href={`/admin/exams/${examId}/settings`} className="rounded-[16px] border border-cyan-400/12 bg-cyan-400/[0.035] p-4 transition hover:bg-cyan-400/[0.06]">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-cyan-100">Pengaturan & Punishment</p>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${policy.security.enableProctoring ? "bg-emerald-400/[0.08] text-emerald-300" : "bg-white/[0.04] text-slate-600"}`}>{policy.security.enableProctoring ? "PROCTOR ON" : "PROCTOR OFF"}</span>
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-slate-500">Tab switch, fullscreen, screenshot best-effort, copy/paste, shortcut, duplicate tab, limit pelanggaran, attempt, navigasi, dan hasil.</p>
                      <p className="mt-2 text-[11px] font-medium text-cyan-300/70">Limit: {policy.security.violationLimit} · Auto-submit: {policy.security.autoSubmitOnLimit ? "ON" : "OFF"} →</p>
                    </Link>
                    <Link href={`/admin/exams/${examId}/proctor`} className="rounded-[16px] border border-violet-400/12 bg-violet-400/[0.03] p-4 transition hover:bg-violet-400/[0.055]">
                      <p className="text-xs font-semibold text-violet-100">Proctor Monitor</p>
                      <p className="mt-2 text-[11px] leading-5 text-slate-500">Pantau sesi aktif, jumlah violation, jenis pelanggaran terakhir, dan submit paksa jika diperlukan.</p>
                      <p className="mt-2 text-[11px] font-medium text-violet-300/70">Buka monitoring →</p>
                    </Link>
                  </div>

                  <div className="mt-5 rounded-[18px] border border-white/[0.055] bg-white/[0.018] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-300">Kontrol Ujian</p>
                        <p className="mt-1 text-[11px] text-slate-600">Aksi operasional. Status ujian tetap ditampilkan pada badge di bagian atas kartu.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {exam.status === "DRAFT" ? <form action={activateExam.bind(null, examId)}><ConfirmSubmitButton disabled={!examReady} title={examReady ? "Aktifkan ujian" : "Selesaikan seluruh kendala kesiapan terlebih dahulu"} message={`Aktifkan ujian ${exam.title}? Peserta batch akan disinkronkan dan aturan Keamanan, Punishment, Kontrol Sesi, serta Instruksi akan dikunci demi konsistensi ujian.`} className="liquid-button-primary rounded-[12px] px-4 py-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40">{examReady ? "Aktifkan Ujian" : "Belum Siap Diaktifkan"}</ConfirmSubmitButton></form> : null}
                        {exam.status === "ACTIVE" ? <form action={closeExam.bind(null, examId)}><ConfirmSubmitButton message={`Tutup login baru untuk ${exam.title}? Peserta yang sudah memiliki sesi aktif tetap dapat ditangani sesuai kebijakan resume.`} className="liquid-button rounded-[12px] border-amber-400/15 px-4 py-2.5 text-xs font-semibold text-amber-200">Tutup Login Peserta Baru</ConfirmSubmitButton></form> : null}
                        {exam.status === "CLOSED" ? <form action={reopenExam.bind(null, examId)}><ConfirmSubmitButton message={`Buka kembali login peserta untuk ${exam.title}? Pastikan Hard Close dan masa langganan masih valid.`} className="liquid-button rounded-[12px] border-cyan-400/15 px-4 py-2.5 text-xs font-semibold text-cyan-200">Buka Login Peserta</ConfirmSubmitButton></form> : null}
                        <Link href={`/admin/exams/${examId}/communication`} className="liquid-button rounded-[12px] px-4 py-2.5 text-xs font-semibold">Komunikasi</Link>
                        {exam.status === "DRAFT" ? <form action={deleteExam.bind(null, examId)}><ConfirmSubmitButton message={`Hapus draft ujian ${exam.title}?`} className="rounded-[12px] border border-rose-400/15 bg-rose-400/[0.04] px-4 py-2.5 text-xs font-semibold text-rose-200">Hapus Draft</ConfirmSubmitButton></form> : null}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
</main>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) { return <div className="liquid-card p-5"><p className="text-[11px] uppercase tracking-[0.13em] text-slate-600">{label}</p><p className={`mt-2 text-2xl font-semibold ${accent ? "text-cyan-200" : "text-slate-100"}`}>{value}</p></div>; }
function Mini({ label, value, good = false, warn = false }: { label: string; value: number; good?: boolean; warn?: boolean }) { return <div className="min-w-16 rounded-[13px] border border-white/[0.055] bg-black/10 px-3 py-2"><p className="text-[11px] uppercase tracking-wider text-slate-700">{label}</p><p className={`mt-1 text-sm font-semibold ${good ? "text-emerald-300" : warn ? "text-amber-300" : "text-slate-300"}`}>{value}</p></div>; }
function Status({ status }: { status: string }) { const cls = status === "ACTIVE" ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200" : status === "CLOSED" ? "border-rose-400/15 bg-rose-400/[0.05] text-rose-200" : "border-violet-400/15 bg-violet-400/[0.05] text-violet-200"; const label = status === "ACTIVE" ? "AKTIF" : status === "CLOSED" ? "LOGIN DITUTUP" : "DRAFT"; return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cls}`}>{label}</span>; }
function Schedule({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <div className={`rounded-[15px] border p-3 ${danger ? "border-rose-400/12 bg-rose-400/[0.03]" : "border-white/[0.055] bg-black/10"}`}><p className="text-[11px] uppercase tracking-wider text-slate-700">{label}</p><p className={`mt-2 text-[11px] font-medium ${danger ? "text-rose-200" : "text-slate-300"}`}>{value}</p></div>; }
function DownloadLink({ href, label, ready }: { href: string; label: string; ready: boolean }) { return ready ? <Link href={href} className="liquid-button flex items-center justify-center rounded-[12px] px-3 py-2.5 text-xs font-semibold text-slate-300">{label}</Link> : <span className="flex cursor-not-allowed items-center justify-center rounded-[12px] border border-white/[0.04] bg-white/[0.015] px-3 py-2.5 text-xs font-semibold text-slate-700">{label}</span>; }

