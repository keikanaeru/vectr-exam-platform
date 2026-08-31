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

      <section>
        <div className="r9-surface px-6 py-8 sm:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="r9-badge">{organization.name}</span>
            <span className="text-xs text-slate-500">Import Peserta</span>
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-100">Import Peserta</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Upload Excel atau CSV. Peserta baru ditambahkan, sedangkan kode yang sudah ada dilewati dan dilaporkan secara rinci.
          </p>
        </div>
      </section>


      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">

        <ImportParticipantForm
          batches={batches}
        />


        <aside className="space-y-4">

          <div className="r9-surface p-5">

            <div className="relative z-10">

              <p className="r9-kicker">
                Disarankan
              </p>


              <h3 className="mt-2 text-sm font-semibold text-slate-100">
                Pakai Template
              </h3>


              <p className="mt-2 text-[11px] leading-5 text-slate-500">
                Template adalah format paling aman, tetapi importer tetap mengenali beberapa variasi nama header umum.
              </p>


              <Link
                href="/admin/participants/import/template"
                className="r9-button r9-button--secondary mt-4 w-full"
              >
                Download Template Excel
              </Link>

            </div>

          </div>


          <div className="r9-surface p-5">

            <div className="relative z-10">

              <p className="text-xs font-semibold text-slate-100">
                Perilaku Duplikat
              </p>


              <div className="mt-3 space-y-2 text-[11px] leading-5 text-slate-400">

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
            className="r9-button r9-button--secondary w-full"
          >
            ← Kembali ke Peserta
          </Link>

        </aside>

      </section>

    </main>
  );
}
