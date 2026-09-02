import Link from "next/link";
import { notFound } from "next/navigation";

import AdminPageHero from "@/app/admin/ui/AdminPageHero";
import FlashNotice from "@/app/ui/FlashNotice";
import { requireAdminReadAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";

import RemedialAssignmentMatrix from "./RemedialAssignmentMatrix";
import { saveRemedialAssignments } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { error?: string; success?: string };

export default async function ExamRemedialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: examId } = await params;
  const query = await searchParams;
  const { organizationId, organization } = await requireAdminReadAccess();
  const supabase = createAdminClient();

  const [{ data: exam, error: examError }, { data: sections, error: sectionError }] = await Promise.all([
    supabase.from("exams").select("id, title, status, batch_id").eq("id", examId).eq("organization_id", organizationId).maybeSingle(),
    supabase.from("exam_sections").select("id, module_id, order_index, duration_minutes").eq("exam_id", examId).order("order_index", { ascending: true }),
  ]);

  if (examError) throw new Error("Gagal membaca ujian remedial.");
  if (sectionError) throw new Error("Gagal membaca sesi modul remedial.");
  if (!exam) notFound();

  const sectionRows = sections ?? [];
  const moduleIds = sectionRows.map((section) => String(section.module_id));
  const [{ data: modules, error: moduleError }, { data: assignments, error: assignmentError }] = await Promise.all([
    moduleIds.length ? supabase.from("modules").select("id, code, name").in("id", moduleIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("exam_assignments").select("id, candidate_id, active").eq("exam_id", examId).eq("active", true),
  ]);
  if (moduleError) throw new Error("Gagal membaca nama modul remedial.");
  if (assignmentError) throw new Error("Gagal membaca peserta remedial.");

  const candidateIds = (assignments ?? []).map((assignment) => String(assignment.candidate_id));
  const [{ data: candidates, error: candidateError }, { data: overrides, error: overrideError }] = await Promise.all([
    candidateIds.length
      ? supabase.from("candidates").select("id, candidate_code, display_name").eq("organization_id", organizationId).in("id", candidateIds)
      : Promise.resolve({ data: [], error: null }),
    candidateIds.length
      ? supabase.from("exam_assignment_sections").select("assignment_id, exam_section_id").in("assignment_id", (assignments ?? []).map((assignment) => String(assignment.id)))
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (candidateError) throw new Error("Gagal membaca identitas peserta remedial.");
  // A pre-migration visit should not crash the entire admin area; the route
  // displays global defaults until the additive migration is applied.
  if (overrideError && !["42P01", "PGRST205"].includes(overrideError.code ?? "")) throw new Error("Gagal membaca konfigurasi modul remedial.");

  const moduleMap = new Map((modules ?? []).map((module) => [String(module.id), module]));
  const candidateMap = new Map((candidates ?? []).map((candidate) => [String(candidate.id), candidate]));
  const overridesByAssignment = new Map<string, string[]>();
  for (const row of overrides ?? []) {
    const current = overridesByAssignment.get(String(row.assignment_id)) ?? [];
    current.push(String(row.exam_section_id));
    overridesByAssignment.set(String(row.assignment_id), current);
  }
  const globalSectionIds = sectionRows.map((section) => String(section.id));
  const assignmentRows = (assignments ?? []).map((assignment) => {
    const candidate = candidateMap.get(String(assignment.candidate_id));
    return {
      id: String(assignment.id),
      candidateCode: candidate?.candidate_code ? String(candidate.candidate_code) : "-",
      displayName: candidate?.display_name ? String(candidate.display_name) : "Peserta",
      selectedSectionIds: overridesByAssignment.get(String(assignment.id)) ?? globalSectionIds,
    };
  }).sort((left, right) => left.candidateCode.localeCompare(right.candidateCode, "id-ID", { numeric: true }));

  const save = saveRemedialAssignments.bind(null, examId);
  const locked = String(exam.status) !== "DRAFT";

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-8">
      <AdminPageHero
        eyebrow="Remedial / Per Peserta"
        title="Atur Modul Remedial"
        organizationName={organization.name}
        status={<span className="r9-badge">{String(exam.status)}</span>}
        description={<span>{String(exam.title)} · pilih modul berbeda untuk setiap peserta tanpa mengubah konfigurasi ujian global.</span>}
        backHref="/admin/exams"
        backLabel="Kembali ke Ujian"
        actions={<Link href={`/admin/exams/${examId}/settings`} className="r9-button r9-button--secondary">Pengaturan Ujian →</Link>}
      />

      {query.error ? <FlashNotice tone="error" message={query.error} /> : null}
      {query.success ? <FlashNotice tone="success" message={query.success} /> : null}

      <section className="r9-surface-subtle mt-6 border-cyan-400/20 bg-cyan-400/[0.03] p-5 sm:p-6">
        <p className="r9-kicker">Alur yang disarankan</p>
        <h2 className="mt-2 text-lg font-semibold text-white">Ini jalur modul per peserta, bukan retake otomatis</h2>
        <ol className="mt-3 grid gap-3 text-xs leading-5 text-slate-400 sm:grid-cols-2">
          <li><span className="font-semibold text-cyan-200">1. Sebelum aktif:</span> pilih modul yang harus dikerjakan tiap peserta, simpan, lalu aktifkan ujian.</li>
          <li><span className="font-semibold text-cyan-200">2. Saat ujian:</span> peserta tetap memakai link dan credential ujian yang sama, tetapi hanya melihat modul pada assignment-nya.</li>
    <li><span className="font-semibold text-cyan-200">3. Buka kembali (Reopen):</span> ujian CLOSED bisa dibuka menjadi ACTIVE lagi selama Hard Close belum lewat. Ini melanjutkan ujian yang sama, bukan membuat remedial otomatis.</li>
          <li><span className="font-semibold text-cyan-200">4. Remedial setelah hasil/Hard Close:</span> buat ujian baru (batch boleh sama atau baru), beri judul jelas seperti “Remedial · Ujian 1”, lalu atur modul per peserta di ujian baru itu.</li>
        </ol>
        <p className="mt-4 border-t border-white/[0.07] pt-3 text-[11px] leading-5 text-amber-200/80">
          Ujian yang sudah ACTIVE/CLOSED dikunci supaya soal, waktu, dan hasil historis tidak berubah. Jadi aplikasi tidak memindahkan peserta atau membuat batch remedial secara otomatis.
        </p>
      </section>

      <section className="r9-surface mt-6 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="r9-kicker">Assignment Module Set</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Satu peserta, satu set remedial</h2>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
              Contoh: peserta A hanya mengulang Modul A, peserta B hanya Modul C, peserta C mengulang Modul A dan B. Peserta yang belum punya override tetap memakai semua modul global sampai konfigurasi disimpan.
            </p>
          </div>
          <div className="r9-badge shrink-0">{assignmentRows.length} peserta · {sectionRows.length} modul</div>
        </div>

        {locked ? (
          <div className="r9-surface-subtle mt-5 border-amber-400/30 bg-amber-400/[0.04] p-4 text-xs leading-5 text-amber-100">
            Ujian sudah {String(exam.status)}. Modul remedial dikunci agar snapshot soal dan hasil peserta tidak berubah setelah sesi berjalan.
          </div>
        ) : null}

        {!assignmentRows.length ? (
          <p className="mt-6 rounded-[14px] border border-white/[0.08] px-4 py-5 text-sm text-slate-500">Belum ada peserta aktif pada assignment ujian.</p>
        ) : !sectionRows.length ? (
          <p className="mt-6 rounded-[14px] border border-amber-400/20 bg-amber-400/[0.04] px-4 py-5 text-sm text-amber-100">Ujian belum memiliki sesi modul.</p>
        ) : (
          <RemedialAssignmentMatrix
            sections={sectionRows.map((section) => {
              const sectionModule = moduleMap.get(String(section.module_id));
              return { id: String(section.id), code: sectionModule?.code ? String(sectionModule.code) : "-", name: sectionModule?.name ? String(sectionModule.name) : "Modul", durationMinutes: Number(section.duration_minutes) };
            })}
            assignments={assignmentRows}
            action={save}
            disabled={locked}
          />
        )}
      </section>
    </main>
  );
}
