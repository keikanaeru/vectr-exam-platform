import Link from "next/link";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  requireAdminReadAccess,
} from "@/lib/organization-subscription";

import ImportParticipantForm from "./ImportParticipantForm";


export const dynamic =
  "force-dynamic";


export default async function ParticipantImportPage() {
  const {
    organizationId,
    organization,
  } =
    await requireAdminReadAccess();


  const supabase =
    createAdminClient();


  const {
    data: batchRows,
    error: batchesError,
  } =
    await supabase
      .from("batches")
      .select(
        "id, code, name, status"
      )
      .eq(
        "organization_id",
        organizationId
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      );


  if (batchesError) {
    console.error(
      "IMPORT PAGE BATCH ERROR:",
      batchesError
    );


    throw new Error(
      "Gagal membaca batch peserta."
    );
  }


  const batches =
    Array.isArray(
      batchRows
    )
      ? batchRows.map(
          (batch) => ({
            id:
              String(
                batch.id
              ),

            code:
              String(
                batch.code
              ),

            name:
              String(
                batch.name
              ),
          })
        )
      : [];


  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-8">

      <section className="liquid-enter">

        <div className="admin-page-hero relative overflow-hidden rounded-[28px] border border-white/[0.07] bg-white/[0.025] px-6 py-8 backdrop-blur-xl sm:px-8">

          <div className="pointer-events-none absolute -right-24 -top-24 h-60 w-60 rounded-full bg-violet-500/10 blur-3xl" />


          <div className="relative">

            <div className="flex flex-wrap items-center gap-3">

              <span className="liquid-badge px-3 py-1.5 text-xs font-medium text-slate-300">
                {organization.name}
              </span>


              <span className="text-xs text-slate-600">
                Import Peserta
              </span>

            </div>


            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white">
              Import Peserta
            </h1>


            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Upload Excel atau CSV. Peserta baru ditambahkan, sedangkan kode yang sudah ada dilewati dan dilaporkan secara rinci.
            </p>

          </div>

        </div>

      </section>


      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">

        <ImportParticipantForm
          batches={batches}
        />


        <aside className="space-y-4">

          <div className="liquid-card p-5">

            <div className="relative z-10">

              <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-300/60">
                Disarankan
              </p>


              <h3 className="mt-2 text-sm font-semibold text-slate-200">
                Pakai Template
              </h3>


              <p className="mt-2 text-[11px] leading-5 text-slate-600">
                Template adalah format paling aman, tetapi importer tetap mengenali beberapa variasi nama header umum.
              </p>


              <Link
                href="/admin/participants/import/template"
                className="liquid-button mt-4 flex w-full items-center justify-center rounded-[13px] px-4 py-3 text-xs font-semibold text-slate-200"
              >
                Download Template Excel
              </Link>

            </div>

          </div>


          <div className="liquid-card p-5">

            <div className="relative z-10">

              <p className="text-xs font-medium text-slate-300">
                Perilaku Duplikat
              </p>


              <div className="mt-3 space-y-2 text-[11px] leading-5 text-slate-500">

                <p>✓ Data baru tetap diimpor</p>

                <p>✓ Kode yang sudah ada dilewati</p>

                <p>✓ Duplikat dalam file dilewati</p>

                <p>✓ Detail kode & nama ditampilkan</p>

                <p>✓ Baris lain tidak ikut batal</p>

              </div>

            </div>

          </div>


          <Link
            href="/admin/participants"
            className="liquid-button flex w-full items-center justify-center rounded-[13px] px-4 py-3 text-xs font-semibold text-slate-200"
          >
            ← Kembali ke Peserta
          </Link>

        </aside>

      </section>

    </main>
  );
}
