import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminReadAccess } from "@/lib/organization-subscription";

import GlassSelect from "@/app/admin/ui/GlassSelect";
import ConfirmSubmitButton from "@/app/admin/ui/ConfirmSubmitButton";
import FlashNotice from "@/app/ui/FlashNotice";
import AppIcon from "@/app/ui/AppIcon";

import {
  createBatch,
  createCandidate,
  deleteBatch,
  deleteCandidate,
  toggleCandidateActive,
  updateBatch,
  updateCandidate,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = {
  error?: string;
  success?: string;
  q?: string;
  batch?: string;
  status?: string;
};

export default async function ParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const errorMessage = typeof params.error === "string" ? params.error : "";
  const successMessage = typeof params.success === "string" ? params.success : "";
  const query = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const batchFilter = typeof params.batch === "string" ? params.batch : "";
  const statusFilter = typeof params.status === "string" ? params.status.toUpperCase() : "";

  const { organizationId, organization } = await requireAdminReadAccess();
  const supabase = createAdminClient();

  const [batchesResult, candidatesResult] = await Promise.all([
    supabase
      .from("batches")
      .select("id, code, name, description, status, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("candidates")
      .select(
        "id, batch_id, candidate_code, display_name, external_identifier, email, active, created_at"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
  ]);

  if (batchesResult.error) throw new Error("Gagal membaca batch peserta.");
  if (candidatesResult.error) throw new Error("Gagal membaca peserta.");

  const batches = batchesResult.data ?? [];
  const candidates = candidatesResult.data ?? [];
  const activeCandidates = candidates.filter((candidate) => candidate.active);
  const withEmail = activeCandidates.filter((candidate) => Boolean(candidate.email?.trim())).length;

  const filteredCandidates = candidates.filter((candidate) => {
    if (batchFilter && String(candidate.batch_id) !== batchFilter) return false;
    if (statusFilter === "ACTIVE" && !candidate.active) return false;
    if (statusFilter === "INACTIVE" && candidate.active) return false;
    if (!query) return true;

    const haystack = [
      candidate.candidate_code,
      candidate.display_name,
      candidate.external_identifier ?? "",
      candidate.email ?? "",
    ].join(" ").toLowerCase();

    return haystack.includes(query);
  });

  const filteredCandidatesByBatch = new Map<
    string,
    (typeof filteredCandidates)[number][]
  >();

  for (const candidate of filteredCandidates) {
    const key = String(candidate.batch_id ?? "");
    const current = filteredCandidatesByBatch.get(key) ?? [];
    current.push(candidate);
    filteredCandidatesByBatch.set(key, current);
  }

  const hasFilters = Boolean(query || batchFilter || statusFilter);

  const batchOptions = batches.map((batch) => ({
    value: String(batch.id),
    label: String(batch.name),
    description: String(batch.code),
  }));

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-8">
      <section className="admin-page-hero relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.025] px-6 py-8 backdrop-blur-xl sm:px-8">
        <div className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-cyan-500/[0.07] blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="liquid-badge px-3 py-1.5 text-xs text-slate-300">{organization.name}</span>
              <span className="text-xs text-slate-600">Manajemen Peserta</span>
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">Peserta</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Kelola batch dan peserta secara penuh: tambah, import, edit, pindah batch, aktif/nonaktif, dan hapus data yang belum memiliki riwayat ujian.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/participants/import" className="liquid-button-primary rounded-[14px] px-4 py-3 text-xs font-semibold">
              <AppIcon name="upload" className="h-4 w-4" />
              Import Peserta
            </Link>
            <Link href="/admin/participants/export/xlsx" className="liquid-button rounded-[14px] px-4 py-3 text-xs font-semibold text-slate-200">
              <AppIcon name="download" className="h-4 w-4" />
              Export Peserta
            </Link>
          </div>
        </div>
      </section>

      {errorMessage ? <FlashNotice tone="error" message={errorMessage} /> : null}
      {successMessage ? <FlashNotice tone="success" message={successMessage} /> : null}

      <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Batch" value={batches.length} />
        <SummaryCard label="Peserta Aktif" value={activeCandidates.length} />
        <SummaryCard label="Email Siap" value={withEmail} valueClassName="text-emerald-300" />
        <SummaryCard label="Nonaktif" value={candidates.length - activeCandidates.length} valueClassName="text-amber-300" />
      </section>

      <form method="get" className="liquid-card mt-6 grid gap-3 overflow-visible p-4 md:grid-cols-[1fr_260px_220px_auto_auto]">
        <input name="q" defaultValue={params.q ?? ""} placeholder="Cari kode, nama, NIK/NIM, email..." className="liquid-input p-3 text-sm" />
        <GlassSelect name="batch" defaultValue={batchFilter} placeholder="Semua batch" options={[{ value: "", label: "Semua batch" }, ...batchOptions]} />
        <GlassSelect name="status" defaultValue={statusFilter} placeholder="Semua status" options={[{ value: "", label: "Semua status" }, { value: "ACTIVE", label: "Aktif" }, { value: "INACTIVE", label: "Nonaktif" }]} />
        <button className="liquid-button-primary rounded-[13px] px-4 py-3 text-xs font-semibold">Terapkan</button>
        {hasFilters ? (
          <Link href="/admin/participants" className="liquid-button flex items-center justify-center rounded-[13px] px-4 py-3 text-xs font-semibold">Reset</Link>
        ) : (
          <span className="hidden md:block" />
        )}
      </form>

      {hasFilters ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-cyan-400/10 bg-cyan-400/[0.025] px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-cyan-100">Hasil pencarian</p>
            <p className="mt-1 text-[11px] text-slate-500">Menampilkan {filteredCandidates.length} dari {candidates.length} peserta. Hanya batch yang memiliki hasil yang ditampilkan.</p>
          </div>
          <span className="liquid-badge px-3 py-1.5 text-[11px] text-slate-400">{filteredCandidates.length} ditemukan</span>
        </div>
      ) : null}

      <section className={hasFilters ? "mt-5" : "mt-6 grid gap-6 lg:grid-cols-[370px_1fr]"}>
        {!hasFilters ? <form action={createBatch} className="liquid-card h-fit p-6">
          <div className="relative z-10">
            <p className="text-[11px] uppercase tracking-[0.18em] text-violet-300/60">Batch Baru</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Buat Batch</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">Kelompok peserta untuk assignment ujian.</p>

            <label className="mt-5 block text-sm text-slate-400">Kode Batch</label>
            <input name="code" required maxLength={50} placeholder="BREVET-2027-A" className="liquid-input mt-2 p-3" />

            <label className="mt-4 block text-sm text-slate-400">Nama Batch</label>
            <input name="name" required maxLength={150} placeholder="Brevet 2027 Batch A" className="liquid-input mt-2 p-3" />

            <label className="mt-4 block text-sm text-slate-400">Deskripsi</label>
            <textarea name="description" rows={3} placeholder="Opsional" className="liquid-input mt-2 resize-none p-3" />

            <button type="submit" className="liquid-button-primary mt-5 w-full rounded-[14px] px-4 py-3 text-sm font-semibold">Buat Batch</button>
          </div>
        </form> : null}

        <div>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">{hasFilters ? "Hasil Peserta" : "Daftar Batch & Peserta"}</h2>
              <p className="mt-1 text-xs text-slate-500">{hasFilters ? "Hasil ditampilkan langsung pada batch asal peserta." : "Semua data bisa dikelola langsung dari halaman ini."}</p>
            </div>
            <span className="liquid-badge px-3 py-1.5 text-xs text-slate-400">{filteredCandidates.length}/{candidates.length} peserta</span>
          </div>

          <div className="space-y-5">
            {hasFilters && filteredCandidates.length === 0 ? (
              <div className="liquid-card p-10 text-center">
                <p className="text-sm font-semibold text-slate-300">Tidak ada peserta yang cocok</p>
                <p className="mt-2 text-xs text-slate-500">Ubah kata kunci atau filter, lalu coba lagi.</p>
              </div>
            ) : batches.length ? (
              batches.map((batch) => {
                if (batchFilter && String(batch.id) !== batchFilter) return null;
                const batchCandidates =
                  filteredCandidatesByBatch.get(String(batch.id)) ?? [];
                if (hasFilters && batchCandidates.length === 0) return null;
                const activeCount = batchCandidates.filter((candidate) => candidate.active).length;
                const addCandidate = createCandidate.bind(null, batch.id);
                const editBatch = updateBatch.bind(null, batch.id);
                const removeBatch = deleteBatch.bind(null, batch.id);

                return (
                  <article key={batch.id} className="liquid-card p-5 sm:p-6">
                    <div className="relative z-10">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-violet-300/75">{batch.code}</span>
                            <span className={batch.status === "ACTIVE" ? "liquid-badge liquid-badge-success px-2.5 py-1 text-[11px] font-semibold" : "liquid-badge px-2.5 py-1 text-[11px] font-semibold text-slate-500"}>
                              {batch.status === "ACTIVE" ? "AKTIF" : "NONAKTIF"}
                            </span>
                          </div>
                          <h3 className="mt-3 text-lg font-semibold text-white">{batch.name}</h3>
                          {batch.description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{batch.description}</p> : null}
                          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
                            <span>{batchCandidates.length} total</span>
                            <span>{activeCount} aktif</span>
                          </div>
                        </div>
                      </div>

                      {!hasFilters ? (
                        <>
                          <details className="mt-5 rounded-[20px] border border-white/[0.06] bg-white/[0.018] p-4">
                            <summary className="cursor-pointer list-none text-sm font-medium text-slate-300">Edit informasi batch</summary>
                            <form action={editBatch} className="mt-4 grid gap-3 sm:grid-cols-2">
                              <input name="code" defaultValue={batch.code} required className="liquid-input p-3" />
                              <input name="name" defaultValue={batch.name} required className="liquid-input p-3" />
                              <textarea name="description" defaultValue={batch.description ?? ""} rows={2} className="liquid-input resize-none p-3 sm:col-span-2" />
                              <GlassSelect
                                name="status"
                                defaultValue={batch.status}
                                options={[
                                  { value: "ACTIVE", label: "Aktif" },
                                  { value: "INACTIVE", label: "Nonaktif" },
                                ]}
                              />
                              <button type="submit" className="liquid-button-primary rounded-[14px] px-4 py-3 text-xs font-semibold">Simpan Perubahan Batch</button>
                            </form>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                              <p className="text-[11px] leading-5 text-slate-600">Status bisa diubah dari pilihan di atas. Hapus hanya tersedia untuk batch yang belum dipakai.</p>
                              <form action={removeBatch}>
                                <ConfirmSubmitButton
                                  message={`Hapus batch ${batch.name}? Batch hanya bisa dihapus jika belum punya peserta atau ujian.`}
                                  className="rounded-[12px] border border-rose-400/15 bg-rose-400/[0.035] px-3 py-2 text-[11px] font-semibold text-rose-300 transition hover:bg-rose-400/[0.07]"
                                >
                                  Hapus Batch
                                </ConfirmSubmitButton>
                              </form>
                            </div>
                          </details>

                          <div className="liquid-divider my-5" />

                          <details className="rounded-[20px] border border-cyan-400/10 bg-cyan-400/[0.02] p-4">
                            <summary className="cursor-pointer list-none text-sm font-medium text-cyan-100">+ Tambah Peserta Manual</summary>
                            <form action={addCandidate} className="mt-4 grid gap-3 md:grid-cols-2">
                              <input name="candidate_code" placeholder="Kode peserta" required className="liquid-input p-3" />
                              <input name="display_name" placeholder="Nama peserta" required className="liquid-input p-3" />
                              <input name="external_identifier" placeholder="NIK / NIM" className="liquid-input p-3" />
                              <input name="email" type="email" placeholder="Email" className="liquid-input p-3" />
                              <button type="submit" className="liquid-button-primary rounded-[14px] px-4 py-3 text-sm font-semibold md:col-span-2">Tambah Peserta</button>
                            </form>
                          </details>
                        </>
                      ) : null}

                      <div className={hasFilters ? "mt-4 space-y-3" : "mt-5 space-y-3"}>
                        {batchCandidates.length ? (
                          batchCandidates.map((candidate, index) => {
                            const editCandidate = updateCandidate.bind(null, candidate.id);
                            const toggleCandidate = toggleCandidateActive.bind(null, candidate.id);
                            const removeCandidate = deleteCandidate.bind(null, candidate.id);

                            return (
                              <div key={candidate.id} className="rounded-[20px] border border-white/[0.06] bg-white/[0.022] p-4 transition hover:border-white/[0.11] hover:bg-white/[0.032]">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="flex min-w-0 gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-xs font-semibold text-slate-400">{index + 1}</div>
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-medium text-slate-200">{candidate.display_name}</p>
                                        <span className={candidate.active ? "text-[11px] font-semibold uppercase tracking-wider text-emerald-300/70" : "text-[11px] font-semibold uppercase tracking-wider text-rose-300/70"}>
                                          {candidate.active ? "AKTIF" : "NONAKTIF"}
                                        </span>
                                      </div>
                                      <p className="mt-1 font-mono text-xs text-blue-300/70">{candidate.candidate_code}</p>
                                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
                                        <span>NIK/NIM: {candidate.external_identifier ?? "-"}</span>
                                        <span>Email: {candidate.email ?? "-"}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <form action={toggleCandidate}>
                                    <button type="submit" className="liquid-button rounded-[12px] px-3 py-2 text-[11px] font-semibold text-slate-300">
                                      {candidate.active ? "Nonaktifkan" : "Aktifkan"}
                                    </button>
                                  </form>
                                </div>

                                <details className="mt-4 rounded-[16px] border border-white/[0.05] bg-black/10 p-3">
                                  <summary className="cursor-pointer list-none text-xs font-medium text-slate-400">Edit / pindah batch / hapus</summary>
                                  <form action={editCandidate} className="mt-4 grid gap-3 md:grid-cols-2">
                                    <GlassSelect name="batch_id" defaultValue={String(candidate.batch_id)} options={batchOptions} />
                                    <input name="candidate_code" defaultValue={candidate.candidate_code} required className="liquid-input p-3" />
                                    <input name="display_name" defaultValue={candidate.display_name} required className="liquid-input p-3" />
                                    <input name="external_identifier" defaultValue={candidate.external_identifier ?? ""} placeholder="NIK / NIM" className="liquid-input p-3" />
                                    <input name="email" type="email" defaultValue={candidate.email ?? ""} placeholder="Email" className="liquid-input p-3 md:col-span-2" />
                                    <button type="submit" className="liquid-button-primary rounded-[13px] px-4 py-3 text-xs font-semibold md:col-span-2">Simpan Data Peserta</button>
                                  </form>
                                  <form action={removeCandidate} className="mt-3">
                                    <ConfirmSubmitButton message={`Hapus ${candidate.display_name}? Peserta yang sudah punya assignment ujian tidak dapat dihapus dan harus dinonaktifkan.`} className="w-full rounded-[13px] border border-rose-400/15 bg-rose-400/[0.04] px-4 py-3 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/[0.08]">
                                      Hapus Peserta
                                    </ConfirmSubmitButton>
                                  </form>
                                </details>
                              </div>
                            );
                          })
                        ) : (
                          <div className="rounded-[18px] border border-dashed border-white/[0.08] px-5 py-8 text-center text-sm text-slate-600">Belum ada peserta pada batch ini.</div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="liquid-card p-10 text-center text-sm text-slate-500">Belum ada batch. Buat batch pertama di panel sebelah kiri.</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  valueClassName = "text-white",
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="liquid-card p-4">
      <div className="relative z-10">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`mt-2 text-2xl font-bold ${valueClassName}`}>{value}</p>
      </div>
    </div>
  );
}
