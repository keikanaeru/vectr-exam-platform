import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminReadAccess } from "@/lib/organization-subscription";

import ConfirmSubmitButton from "@/app/admin/ui/ConfirmSubmitButton";
import FlashNotice from "@/app/ui/FlashNotice";
import AdminPrimaryHeader from "@/app/admin/ui/AdminPrimaryHeader";
import { Status } from "@/app/admin/r9/ui";

import {
  createModule,
  deleteModule,
  toggleModuleStatus,
  updateModule,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { error?: string; success?: string };

export default async function ModulesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const errorMessage = typeof params.error === "string" ? params.error : "";
  const successMessage = typeof params.success === "string" ? params.success : "";

  const { organizationId } = await requireAdminReadAccess();
  const supabase = createAdminClient();

  const moduleResult = await supabase
    .from("modules")
    .select(
      "id, code, name, description, default_duration_minutes, shuffle_questions, shuffle_options, status, created_at"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (moduleResult.error) throw new Error("Gagal membaca modul.");

  const modules = moduleResult.data ?? [];
  const moduleIds = modules.map((module) => String(module.id));
  const questionResult = moduleIds.length
    ? await supabase.from("questions").select("module_id, status").in("module_id", moduleIds)
    : { data: [], error: null };

  if (questionResult.error) throw new Error("Gagal membaca ringkasan bank soal.");
  const questions = questionResult.data ?? [];

  const questionStatsByModule = new Map<
    string,
    { total: number; active: number }
  >();

  for (const question of questions) {
    const key = String(question.module_id);
    const current =
      questionStatsByModule.get(key) ?? {
        total: 0,
        active: 0,
      };

    current.total += 1;

    if (question.status === "ACTIVE") {
      current.active += 1;
    }

    questionStatsByModule.set(key, current);
  }

  const activeModules = modules.filter(
    (module) => module.status === "ACTIVE"
  ).length;

  const totalQuestions = questions.length;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-8">
      <AdminPrimaryHeader
        eyebrow="Pusat Bank Soal"
        title="Modul & Bank Soal"
        description="Modul bisa diedit, diaktifkan/nonaktifkan, dihapus jika belum dipakai, serta memiliki bank soal manual dan import/export Excel."
      />

      <section className="admin-summary-strip admin-module-summary mt-5 grid grid-cols-3 gap-0">
        <MiniStat label="Modul" value={modules.length} />
        <MiniStat label="Aktif" value={activeModules} />
        <MiniStat label="Soal" value={totalQuestions} />
      </section>

      {errorMessage ? <FlashNotice tone={errorMessage.toLowerCase().includes("dikunci") ? "warning" : "error"} message={errorMessage} /> : null}
      {successMessage ? <FlashNotice tone="success" message={successMessage} /> : null}

      <section className="mt-6 grid gap-6 lg:grid-cols-[390px_1fr]">
        <form action={createModule} className="r9-surface h-fit p-6">
          <div className="relative z-10">
            <p className="r9-kicker">Modul Baru</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-100">Buat Modul</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">Setelan dasar dapat diubah lagi setelah modul dibuat.</p>

            <label className="r9-field-label mt-5">Kode Modul</label>
            <input name="code" required maxLength={50} placeholder="BREVET-A-PPH" className="r9-input mt-2" />

            <label className="r9-field-label mt-4">Nama Modul</label>
            <input name="name" required maxLength={150} placeholder="Brevet A - PPh" className="r9-input mt-2" />

            <label className="r9-field-label mt-4">Deskripsi</label>
            <textarea name="description" rows={3} className="r9-input mt-2 resize-none" placeholder="Opsional" />

            <label className="r9-field-label mt-4">Durasi Default</label>
            <div className="relative mt-2">
              <input name="duration" type="number" min={1} max={1440} defaultValue={60} required className="r9-input pr-16" />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs text-slate-600">menit</span>
            </div>

            <div className="mt-4 space-y-3 rounded-[18px] border border-white/[0.06] bg-black/10 p-4">
              <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-300">
                <span>Acak urutan soal</span>
                <input type="checkbox" name="shuffle_questions" defaultChecked className="h-4 w-4 accent-cyan-400" />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-300">
                <span>Acak pilihan jawaban</span>
                <input type="checkbox" name="shuffle_options" defaultChecked className="h-4 w-4 accent-cyan-400" />
              </label>
            </div>

            <button type="submit" className="r9-button r9-button--primary mt-5 w-full">Buat Modul</button>
          </div>
        </form>

        <div className="space-y-5">
          {modules.length ? (
            modules.map((module) => {
              const questionStats =
                questionStatsByModule.get(String(module.id)) ?? {
                  total: 0,
                  active: 0,
                };
              const editModule = updateModule.bind(null, module.id);
              const toggleModule = toggleModuleStatus.bind(null, module.id);
              const removeModule = deleteModule.bind(null, module.id);

              return (
                <article key={module.id} className="r9-surface p-5 sm:p-6">
                  <div className="relative z-10">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-cyan-300/75">{module.code}</span>
                          <Status tone={module.status === "ACTIVE" ? "success" : "neutral"}>{module.status === "ACTIVE" ? "AKTIF" : module.status === "INACTIVE" ? "NONAKTIF" : "DRAFT"}</Status>
                        </div>
                        <h3 className="mt-3 text-xl font-semibold text-slate-100">{module.name}</h3>
                        {module.description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{module.description}</p> : null}
                        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600">
                          <span>{module.default_duration_minutes} menit</span>
                          <span>{questionStats.total} soal</span>
                          <span className="text-emerald-300/60">{questionStats.active} aktif</span>
                        </div>
                      </div>

                      <div className="admin-module-actions flex flex-wrap gap-2">
                        <Link href={`/admin/modules/${module.id}`} className="r9-button r9-button--secondary">Buka Bank Soal</Link>
                        <Link href={`/admin/modules/${module.id}/questions/import`} className="r9-button r9-button--secondary">↥ Import Soal</Link>
                        <Link href={`/admin/modules/${module.id}/questions/export/xlsx`} className="r9-button r9-button--secondary">Excel</Link>
                        <form action={toggleModule}>
                          <button type="submit" className={module.status === "ACTIVE" ? "r9-button r9-button--secondary" : "r9-button r9-button--primary"}>
                            {module.status === "ACTIVE" ? "Nonaktifkan Modul" : "Aktifkan Modul"}
                          </button>
                        </form>
                      </div>
                    </div>

                    <details className="mt-5 rounded-[18px] border border-white/[0.06] bg-black/10 p-4">
                      <summary className="cursor-pointer list-none text-sm font-medium text-slate-300">Pengaturan modul</summary>
                      <form action={editModule} className="mt-4 grid gap-3 md:grid-cols-2">
                        <input name="code" defaultValue={module.code} required className="r9-input md:col-span-1" aria-label="Kode modul" />
                        <input name="name" defaultValue={module.name} required className="r9-input" aria-label="Nama modul" />
                        <textarea name="description" defaultValue={module.description ?? ""} rows={2} className="r9-input resize-none md:col-span-2" aria-label="Deskripsi modul" />
                        <input name="duration" type="number" min={1} max={1440} defaultValue={module.default_duration_minutes} className="r9-input" aria-label="Durasi default dalam menit" />
                        <div className="rounded-[14px] border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                          <p className="text-[11px] uppercase tracking-wider text-slate-600">Status Modul</p>
                          <p className="mt-1 text-sm font-medium text-slate-300">{module.status === "ACTIVE" ? "Aktif — siap dipakai ujian" : module.status === "INACTIVE" ? "Nonaktif — tidak bisa dipilih" : "Draft — bisa dipakai menyusun ujian draft"}</p>
                        </div>
                        <label className="flex items-center justify-between rounded-[14px] border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs text-slate-400">
                          Acak soal
                          <input type="checkbox" name="shuffle_questions" defaultChecked={Boolean(module.shuffle_questions)} className="h-4 w-4 accent-cyan-400" />
                        </label>
                        <label className="flex items-center justify-between rounded-[14px] border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs text-slate-400">
                          Acak opsi
                          <input type="checkbox" name="shuffle_options" defaultChecked={Boolean(module.shuffle_options)} className="h-4 w-4 accent-cyan-400" />
                        </label>
                        <button type="submit" className="r9-button r9-button--primary md:col-span-2">Simpan Pengaturan</button>
                      </form>
                      <div className="mt-3">
                        <form action={removeModule}>
                          <ConfirmSubmitButton message={`Hapus modul ${module.name}? Modul hanya dapat dihapus jika belum punya soal dan ujian.`} className="r9-button r9-button--danger w-full">Hapus Modul</ConfirmSubmitButton>
                        </form>
                      </div>
                    </details>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="r9-surface p-12 text-center text-sm text-slate-500">Belum ada modul.</div>
          )}
        </div>
      </section>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-primary-summary-cell rounded-[16px] border border-white/[0.07] bg-black/10 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-slate-600">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-200">{value}</p>
    </div>
  );
}
