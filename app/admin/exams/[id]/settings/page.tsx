import Link from "next/link";
import { notFound } from "next/navigation";

import AdminPageHero from "@/app/admin/ui/AdminPageHero";
import GlassSelect from "@/app/admin/ui/GlassSelect";
import FlashNotice from "@/app/ui/FlashNotice";
import { getExamPolicy } from "@/lib/exam-policy";
import { requireAdminReadAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateExamPolicy } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { error?: string; success?: string };

export default async function ExamSettingsPage({
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

  const { data: exam, error } = await supabase
    .from("exams")
    .select("id, title, status, settings")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error("Gagal membaca pengaturan ujian.");
  if (!exam) notFound();

  const policy = getExamPolicy(exam.settings);
  const runtimeLocked = String(exam.status) !== "DRAFT";
  const save = updateExamPolicy.bind(null, examId);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-8">
      <AdminPageHero
        eyebrow="Tata Kelola Ujian"
        title="Pengaturan Ujian"
        organizationName={organization.name}
        status={<span className="r9-badge">{String(exam.status)}</span>}
        description={<span>{String(exam.title)} · Atur keamanan, punishment, sesi, hasil, dan instruksi peserta dari satu tempat.</span>}
        backHref="/admin/exams"
        backLabel="Kembali ke Ujian"
        actions={
          <Link href={`/admin/exams/${examId}/proctor`} className="r9-button r9-button--secondary">
            Buka Proctor Monitor →
          </Link>
        }
      />

      {query.error ? <FlashNotice tone="error" message={query.error} /> : null}
      {query.success ? <FlashNotice tone="success" message={query.success} /> : null}

      <div className="r9-surface mt-6 border-amber-400/30 bg-amber-400/[0.04] p-5">
        <p className="text-sm font-semibold text-amber-200">Catatan tentang screenshot</p>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          Browser tidak bisa menjamin pemblokiran screenshot OS 100%. Mode ini melakukan deteksi <span className="font-mono text-slate-300">PrintScreen</span> best-effort,
          mencatat event, menampilkan warning, dan dapat dihitung sebagai pelanggaran. Screenshot dari perangkat kedua juga tidak dapat dideteksi browser.
        </p>
      </div>


      {runtimeLocked ? (
        <div className="r9-surface mt-4 border-amber-400/30 bg-amber-400/[0.04] p-5">
          <p className="text-sm font-semibold text-amber-100">Aturan runtime sudah dikunci</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">Sejak ujian diaktifkan, Security, Punishment, Kontrol Sesi, dan Instruksi Peserta tidak lagi dapat diubah agar seluruh peserta menjalani aturan yang sama. Visibilitas Hasil tetap dapat diatur untuk kebutuhan publikasi hasil.</p>
        </div>
      ) : null}

      <form action={save} className="mt-6 space-y-6">
        <fieldset disabled={runtimeLocked} className={runtimeLocked ? "opacity-60" : ""}>
        <Section title="Keamanan & Proctoring" description="Atur perilaku yang dilarang, deteksi pelanggaran, dan punishment otomatis.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Toggle name="enable_proctoring" label="Aktifkan proctoring" description="Nyalakan seluruh event monitoring kandidat." checked={policy.security.enableProctoring} />
            <Toggle name="require_fullscreen" label="Wajib fullscreen" description="Minta fullscreen saat sesi dimulai dan catat saat keluar." checked={policy.security.requireFullscreen} />
            <Toggle name="detect_tab_switch" label="Deteksi pindah tab/app" description="Visibility hidden dihitung sebagai pelanggaran." checked={policy.security.detectTabSwitch} />
            <Toggle name="detect_window_blur" label="Deteksi window blur" description="Mendeteksi fokus pindah ke jendela lain." checked={policy.security.detectWindowBlur} />
            <Toggle name="detect_print_screen" label="Deteksi PrintScreen" description="Best-effort untuk tombol screenshot keyboard." checked={policy.security.detectPrintScreen} />
            <Toggle name="detect_duplicate_tab" label="Deteksi duplicate tab" description="Mendeteksi ujian yang sama terbuka di tab browser lain." checked={policy.security.detectDuplicateTab} />
            <Toggle name="enforce_single_device" label="Kunci satu perangkat" description="Credential yang sama tidak boleh aktif bersamaan di perangkat/browser berbeda. Pengawas dapat melepas lock." checked={policy.security.enforceSingleDevice} />
            <Toggle name="prevent_copy_paste" label="Blok copy / cut / paste" description="Mencegah salin-tempel dari dan ke halaman ujian." checked={policy.security.preventCopyPaste} />
            <Toggle name="prevent_context_menu" label="Blok klik kanan" description="Menonaktifkan context menu selama ujian." checked={policy.security.preventContextMenu} />
            <Toggle name="prevent_text_selection" label="Blok seleksi teks" description="Membatasi pemilihan teks soal di halaman." checked={policy.security.preventTextSelection} />
            <Toggle name="prevent_print" label="Blok print" description="Mencegah Ctrl/Cmd+P dan menyembunyikan konten saat print." checked={policy.security.preventPrint} />
            <Toggle name="prevent_save_page" label="Blok save page" description="Mencegah Ctrl/Cmd+S." checked={policy.security.preventSavePage} />
            <Toggle name="prevent_devtools_shortcuts" label="Blok shortcut devtools" description="Blok F12 dan shortcut umum Inspect/Console. Tidak menjamin devtools tertutup." checked={policy.security.preventDevtoolsShortcuts} />
            <Toggle name="detect_offline" label="Catat perangkat offline" description="Mencatat event ketika koneksi browser terputus." checked={policy.security.detectOffline} />
          </div>

          <div className="r9-surface-subtle mt-6 p-5">
            <div>
              <p className="text-sm font-semibold text-slate-200">Punishment per jenis pelanggaran</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-600">LOG = hanya audit, COUNT = masuk violation counter, SUBMIT = langsung finalisasi sesi pada event pertama.</p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <PunishmentSelect name="punishment_print_screen" label="Screenshot / PrintScreen" value={policy.security.punishments.PRINT_SCREEN} />
              <PunishmentSelect name="punishment_tab_hidden" label="Pindah tab / aplikasi" value={policy.security.punishments.TAB_HIDDEN} />
              <PunishmentSelect name="punishment_window_blur" label="Window kehilangan fokus" value={policy.security.punishments.WINDOW_BLUR} />
              <PunishmentSelect name="punishment_fullscreen_exit" label="Keluar fullscreen" value={policy.security.punishments.FULLSCREEN_EXIT} />
              <PunishmentSelect name="punishment_copy_paste" label="Copy / cut / paste" value={policy.security.punishments.COPY_PASTE} />
              <PunishmentSelect name="punishment_blocked_shortcut" label="Shortcut terlarang" value={policy.security.punishments.BLOCKED_SHORTCUT} />
              <PunishmentSelect name="punishment_context_menu" label="Klik kanan" value={policy.security.punishments.CONTEXT_MENU} />
              <PunishmentSelect name="punishment_duplicate_tab" label="Duplicate tab" value={policy.security.punishments.DUPLICATE_TAB} />
              <PunishmentSelect name="punishment_multiple_device" label="Perangkat lain aktif" value={policy.security.punishments.MULTIPLE_DEVICE} />
              <PunishmentSelect name="punishment_offline" label="Perangkat offline" value={policy.security.punishments.OFFLINE} />
              <PunishmentSelect name="punishment_page_leave" label="Reload / meninggalkan halaman" value={policy.security.punishments.PAGE_LEAVE} />
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[220px_1fr_1fr]">
            <label className="r9-surface-subtle p-4">
              <span className="text-xs font-semibold text-slate-300">Batas pelanggaran</span>
              <input name="violation_limit" type="number" min="1" max="50" step="1" defaultValue={policy.security.violationLimit} className="r9-input mt-3" />
              <span className="mt-2 block text-[11px] leading-4 text-slate-600">Total event yang dihitung sebelum limit tercapai.</span>
            </label>
            <Toggle name="warn_before_auto_submit" label="Warning sebelum punishment" description="Tampilkan jumlah pelanggaran dan sisa toleransi kepada peserta." checked={policy.security.warnBeforeAutoSubmit} large />
            <Toggle name="auto_submit_on_limit" label="Auto-submit saat limit" description="Jika limit tercapai, server action langsung submit dan scoring sesi." checked={policy.security.autoSubmitOnLimit} large danger />
          </div>
        </Section>
        </fieldset>

        <fieldset disabled={runtimeLocked} className={runtimeLocked ? "opacity-60" : ""}>
        <Section title="Kontrol Sesi" description="Kontrol attempt, resume, navigasi, dan pengalaman pengerjaan.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="r9-surface-subtle p-4">
              <span className="text-xs font-semibold text-slate-300">Maksimum attempt</span>
              <input name="max_attempts" type="number" min="1" max="10" step="1" defaultValue={policy.session.maxAttempts} className="r9-input mt-3" />
              <span className="mt-2 block text-[11px] leading-4 text-slate-600">Dicek sebelum kandidat memulai / membuat sesi baru.</span>
            </label>
            <Toggle name="allow_resume" label="Izinkan resume" description="Peserta boleh melanjutkan sesi ACTIVE setelah refresh/login ulang." checked={policy.session.allowResume} />
            <Toggle name="warn_on_page_leave" label="Warning saat reload / keluar" description="Browser menampilkan konfirmasi saat peserta mencoba meninggalkan halaman ujian." checked={policy.session.warnOnPageLeave} />
            <Toggle name="allow_previous_question" label="Boleh kembali ke soal sebelumnya" description="Jika mati, navigasi hanya maju sampai submit." checked={policy.session.allowPreviousQuestion} />
            <Toggle name="confirm_before_submit" label="Konfirmasi submit manual" description="Minta konfirmasi, termasuk jumlah soal kosong." checked={policy.session.confirmBeforeSubmit} />
            <Toggle name="show_question_code" label="Tampilkan kode soal" description="Kode internal soal terlihat ke peserta." checked={policy.session.showQuestionCode} />
          </div>
        </Section>
        </fieldset>

        <Section title="Visibilitas Hasil" description="Pilih informasi apa yang boleh langsung dilihat peserta setelah submit.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Toggle name="show_result_page" label="Tampilkan halaman hasil" description="Jika mati, peserta hanya melihat konfirmasi submit." checked={policy.results.showResultPage} />
            <Toggle name="show_final_score" label="Tampilkan nilai akhir" description="Menampilkan skor final dan skor mentah." checked={policy.results.showFinalScore} />
            <Toggle name="show_score_breakdown" label="Tampilkan benar/salah/kosong" description="Membuka breakdown jumlah jawaban." checked={policy.results.showScoreBreakdown} />
            <Toggle name="show_completion_summary" label="Tampilkan progress jawaban" description="Menampilkan jumlah soal terjawab dan completion rate." checked={policy.results.showCompletionSummary} />
            <Toggle name="show_pass_fail" label="Tampilkan Lulus / Tidak Lulus" description="Bisa dipakai tanpa membuka angka nilai akhir." checked={policy.results.showPassFail} />
            <label className="r9-surface-subtle p-4">
              <span className="text-xs font-semibold text-slate-300">Passing score</span>
              <input name="passing_score" type="number" min="0" max="100" step="0.01" defaultValue={policy.results.passingScore} className="r9-input mt-3" />
              <span className="mt-2 block text-[11px] leading-4 text-slate-600">Ambang status Lulus, skala nilai akhir 0-100.</span>
            </label>
          </div>
        </Section>

        <fieldset disabled={runtimeLocked} className={runtimeLocked ? "opacity-60" : ""}>
        <Section title="Instruksi Peserta" description="Aturan khusus ujian akan muncul sebelum peserta menekan tombol mulai.">
          <textarea
            name="custom_rules"
            defaultValue={policy.instructions.customRules}
            rows={7}
            maxLength={4000}
            placeholder={'Contoh:\n- Dilarang menggunakan kalkulator selain yang disediakan.\n- Tidak boleh berkomunikasi dengan peserta lain.\n- Pelanggaran ke-3 menyebabkan submit otomatis.'}
            className="r9-input min-h-40 resize-y leading-6"
          />
        </Section>
        </fieldset>

        <div className="sticky bottom-5 z-20 flex justify-end">
          <button className="r9-button r9-button--primary shadow-2xl">{runtimeLocked ? "Simpan Pengaturan Hasil" : "Simpan Semua Pengaturan"}</button>
        </div>
      </form>
</main>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="r9-surface p-6 sm:p-7"><div className="mb-5"><h2 className="text-lg font-semibold text-slate-100">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>{children}</section>;
}

function Toggle({ name, label, description, checked, large = false, danger = false }: { name: string; label: string; description: string; checked: boolean; large?: boolean; danger?: boolean }) {
  return <label className={`r9-surface-subtle flex cursor-pointer items-start gap-3 p-4 transition hover:border-cyan-400/30 ${danger ? "border-rose-400/30 bg-rose-400/[0.025]" : ""} ${large ? "min-h-28" : ""}`}><input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400" /><span><span className={`block text-xs font-semibold ${danger ? "text-rose-200" : "text-slate-300"}`}>{label}</span><span className="mt-1.5 block text-[11px] leading-4 text-slate-500">{description}</span></span></label>;
}

function PunishmentSelect({ name, label, value }: { name: string; label: string; value: "LOG" | "COUNT" | "SUBMIT" }) {
  return <div><label className="mb-2 block text-[11px] font-medium text-slate-500">{label}</label><GlassSelect name={name} defaultValue={value} options={[
    { value: "LOG", label: "LOG ONLY", description: "Catat di audit, tidak menambah counter" },
    { value: "COUNT", label: "COUNT + WARNING", description: "Masuk violation counter dan threshold" },
    { value: "SUBMIT", label: "AUTO SUBMIT", description: "Langsung submit pada event pertama" },
  ]} /></div>;
}
