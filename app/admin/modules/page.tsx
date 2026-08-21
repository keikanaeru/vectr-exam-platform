import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminReadAccess } from "@/lib/organization-subscription";

import ConfirmSubmitButton from "@/app/admin/ui/ConfirmSubmitButton";
import FlashNotice from "@/app/ui/FlashNotice";

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

  const { organizationId, organization } = await requireAdminReadAccess();
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
      <section className="admin-page-hero relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.025] px-6 py-8 backdrop-blur-xl sm:px-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="liquid-badge px-3 py-1.5 text-xs text-slate-300">{organization.name}</span>
              <span className="text-xs text-slate-600">Pusat Bank Soal</span>
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">Modul & Bank Soal</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Modul bisa diedit, diaktifkan/nonaktifkan, dihapus jika belum dipakai, serta memiliki bank soal manual dan import/export Excel.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Modul" value={modules.length} />
            <MiniStat label="Aktif" value={activeModules} />
            <MiniStat label="Soal" value={totalQuestions} />
          </div>
        </div>
      </section>

      {errorMessage ? <FlashNotice tone={errorMessage.toLowerCase().includes("dikunci") ? "warning" : "error"} message={errorMessage} /> : null}
      {successMessage ? <FlashNotice tone="success" message={successMessage} /> : null}

      <section className="mt-6 grid gap-6 lg:grid-cols-[390px_1fr]">
        <form action={createModule} className="liquid-card h-fit p-6">
          <div className="relative z-10">
            <p className="text-[11px] uppercase tracking-[0.18em] text-blue-300/65">Modul Baru</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Buat Modul</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">Setelan dasar dapat diubah lagi setelah modul dibuat.</p>

            <label className="mt-5 block text-sm text-slate-400">Kode Modul</label>
            <input name="code" required maxLength={50} placeholder="BREVET-A-PPH" className="liquid-input mt-2 p-3" />

            <label className="mt-4 block text-sm text-slate-400">Nama Modul</label>
            <input name="name" required maxLength={150} placeholder="Brevet A - PPh" className="liquid-input mt-2 p-3" />

            <label className="mt-4 block text-sm text-slate-400">Deskripsi</label>
            <textarea name="description" rows={3} className="liquid-input mt-2 resize-none p-3" placeholder="Opsional" />

            <label className="mt-4 block text-sm text-slate-400">Durasi Default</label>
            <div className="relative mt-2">
              <input name="duration" type="number" min={1} max={1440} defaultValue={60} required className="liquid-input p-3 pr-16" />
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

            <button type="submit" className="liquid-button-primary mt-5 w-full rounded-[14px] px-4 py-3 text-sm font-semibold">Buat Modul</button>
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
                <article key={module.id} className="liquid-card liquid-card-interactive p-5 sm:p-6">
                  <div className="relative z-10">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-blue-300/75">{module.code}</span>
                          <span className={module.status === "ACTIVE" ? "liquid-badge liquid-badge-success px-2.5 py-1 text-[11px] font-semibold" : "liquid-badge px-2.5 py-1 text-[11px] font-semibold text-slate-500"}>{module.status === "ACTIVE" ? "AKTIF" : module.status === "INACTIVE" ? "NONAKTIF" : "DRAFT"}</span>
                        </div>
                        <h3 className="mt-3 text-xl font-semibold text-white">{module.name}</h3>
                        {module.description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{module.description}</p> : null}
                        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600">
                          <span>{module.default_duration_minutes} menit</span>
                          <span>{questionStats.total} soal</span>
                          <span className="text-emerald-300/60">{questionStats.active} aktif</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Link href={`/admin/modules/${module.id}`} className="liquid-button rounded-[13px] px-4 py-2.5 text-xs font-semibold text-slate-200">Buka Bank Soal</Link>
                        <Link href={`/admin/modules/${module.id}/questions/import`} className="liquid-button rounded-[13px] px-4 py-2.5 text-xs font-semibold text-cyan-200">↥ Import Soal</Link>
                        <Link href={`/admin/modules/${module.id}/questions/export/xlsx`} className="liquid-button rounded-[13px] px-4 py-2.5 text-xs font-semibold text-emerald-200">Excel</Link>
                        <form action={toggleModule}>
                          <button type="submit" className={module.status === "ACTIVE" ? "liquid-button rounded-[13px] px-4 py-2.5 text-xs font-semibold text-amber-200" : "rounded-[13px] border border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-2.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/[0.13]"}>
                            {module.status === "ACTIVE" ? "Nonaktifkan Modul" : "Aktifkan Modul"}
                          </button>
                        </form>
                      </div>
                    </div>

                    <details className="mt-5 rounded-[18px] border border-white/[0.06] bg-black/10 p-4">
                      <summary className="cursor-pointer list-none text-sm font-medium text-slate-300">Pengaturan modul</summary>
                      <form action={editModule} className="mt-4 grid gap-3 md:grid-cols-2">
                        <input name="code" defaultValue={module.code} required className="liquid-input p-3" />
                        <input name="name" defaultValue={module.name} required className="liquid-input p-3" />
                        <textarea name="description" defaultValue={module.description ?? ""} rows={2} className="liquid-input resize-none p-3 md:col-span-2" />
                        <input name="duration" type="number" min={1} max={1440} defaultValue={module.default_duration_minutes} className="liquid-input p-3" />
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
                        <button type="submit" className="liquid-button-primary rounded-[13px] px-4 py-3 text-xs font-semibold md:col-span-2">Simpan Pengaturan</button>
                      </form>
                      <div className="mt-3">
                        <form action={removeModule}>
                          <ConfirmSubmitButton message={`Hapus modul ${module.name}? Modul hanya dapat dihapus jika belum punya soal dan ujian.`} className="w-full rounded-[13px] border border-rose-400/15 bg-rose-400/[0.04] px-4 py-3 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/[0.08]">Hapus Modul</ConfirmSubmitButton>
                        </form>
                      </div>
                    </details>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="liquid-card p-12 text-center text-sm text-slate-500">Belum ada modul.</div>
          )}
        </div>
      </section>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[16px] border border-white/[0.07] bg-black/10 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-slate-600">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-200">{value}</p>
    </div>
  );
}

