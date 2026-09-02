"use client";

import {
  useActionState,
  useRef,
  useState,
} from "react";

import {
  importParticipants,
  type ParticipantImportDetail,
  type ParticipantImportState,
} from "./actions";

import GlassSelect from "@/app/admin/ui/GlassSelect";
import { MetricStrip } from "@/app/admin/r9/ui";

type BatchOption = {
  id: string;
  code: string;
  name: string;
};

const INITIAL_STATE: ParticipantImportState = {
  status: "idle",
  message: "",
  batchName: "",
  totalRows: 0,
  importedCount: 0,
  skippedCount: 0,
  imported: [],
  skipped: [],
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImportParticipantForm({
  batches,
}: {
  batches: BatchOption[];
}) {
  const safeBatches = Array.isArray(batches) ? batches : [];
  const [state, formAction, pending] = useActionState(
    importParticipants,
    INITIAL_STATE
  );

  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function acceptFile(file: File | undefined) {
    if (!file || !fileInputRef.current) {
      return;
    }

    const extension = file.name.toLowerCase();

    if (!extension.endsWith(".xlsx") && !extension.endsWith(".csv")) {
      setSelectedFile(null);
      fileInputRef.current.value = "";
      return;
    }

    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInputRef.current.files = transfer.files;

    setSelectedFile({
      name: file.name,
      size: file.size,
    });
  }

  return (
    <div className="space-y-5">
      <form action={formAction} data-action-feedback="off" className="r9-surface p-6 sm:p-7">
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/65">
                Bulk Import
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-100">Upload Data Peserta</h2>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.07] text-sm font-bold text-cyan-200">
              ↥
            </div>
          </div>

          <label className="r9-field-label mt-6">Batch Tujuan</label>
          <div className="mt-2">
            <GlassSelect
              name="batch_id"
              value={selectedBatchId}
              onValueChange={setSelectedBatchId}
              options={safeBatches.map((batch) => ({
                value: batch.id,
                label: batch.name,
                description: batch.code,
              }))}
              placeholder="Pilih batch peserta"
              emptyMessage="Belum ada batch"
              required={safeBatches.length > 0}
              disabled={safeBatches.length === 0}
            />
          </div>

          <label className="r9-field-label mt-5">File Peserta</label>

          <input
            ref={fileInputRef}
            name="file"
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            required
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setSelectedFile(
                file
                  ? {
                      name: file.name,
                      size: file.size,
                    }
                  : null
              );
            }}
          />

          <div
            data-dragging={dragging ? "true" : "false"}
            className="r9-dropzone mt-2 p-5 text-center"
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              acceptFile(event.dataTransfer.files?.[0]);
            }}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/12 bg-cyan-400/[0.055] text-lg text-cyan-200">
              {selectedFile ? "✓" : "↥"}
            </div>

            {selectedFile ? (
              <>
                <p className="mt-3 break-all text-sm font-medium text-slate-200">
                  {selectedFile.name}
                </p>
                <p className="mt-1 text-[11px] text-slate-600">
                  {formatFileSize(selectedFile.size)} · siap divalidasi
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm font-medium text-slate-300">
                  Drop Excel / CSV di sini
                </p>
                <p className="mt-1 text-[11px] leading-5 text-slate-600">
                  atau pilih file dari komputer
                </p>
              </>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="r9-button r9-button--secondary mt-4"
            >
              {selectedFile ? "Ganti File" : "Pilih File"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="r9-surface-subtle p-4">
              <p className="r9-kicker">
                Kolom Wajib
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Kode Peserta + Nama Peserta
              </p>
            </div>

            <div className="r9-surface-subtle p-4">
              <p className="r9-kicker">
                Duplikat
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Kode / NIK-NIM / email duplikat dilewati
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={
              pending ||
              !selectedBatchId ||
              !selectedFile ||
              safeBatches.length === 0
            }
            className="r9-button r9-button--primary mt-5 w-full disabled:opacity-40"
          >
            {pending ? (
              <span className="flex items-center gap-3">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                Membaca & Memvalidasi...
              </span>
            ) : (
              "Validasi & Import"
            )}
          </button>
        </div>
      </form>

      {state.status !== "idle" ? <ImportResult state={state} /> : null}
    </div>
  );
}

function ImportResult({
  state,
}: {
  state: ParticipantImportState;
}) {
  const success = state.status === "success";

  return (
    <section
      className="r9-import-result r9-surface p-5"
      data-tone={success ? "success" : "danger"}
      role={success ? "status" : "alert"}
      aria-live={success ? "polite" : "assertive"}
    >
      <div className="relative z-10">
        <div className="flex items-start gap-3">
          <div
            className="r9-import-result__icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-bold"
          >
            {success ? "✓" : "!"}
          </div>

          <div>
            <p className="r9-import-result__title text-sm font-semibold">
              {success ? "Import Selesai" : "Import Gagal"}
            </p>
            <p className="r9-import-result__message mt-1 text-xs leading-5">
              {state.message}
            </p>
          </div>
        </div>

        {success ? (
          <MetricStrip
            className="mt-4"
            items={[
              { label: "Baris", value: state.totalRows },
              { label: "Berhasil", value: state.importedCount, tone: "success" },
              { label: "Dilewati", value: state.skippedCount, tone: "warning" },
            ]}
          />
        ) : null}

        {state.skipped.length > 0 ? (
          <div className="mt-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-amber-200">
                  Detail Baris Dilewati
                </p>
                <p className="mt-1 text-[11px] text-slate-600">
                  Kode, nama, NIK/NIM, email, data lama, dan alasan ditampilkan di bawah.
                </p>
              </div>
              <span className="r9-import-badge">
                {state.skipped.length} baris
              </span>
            </div>

            <div className="mt-3 max-h-[460px] space-y-2 overflow-y-auto pr-1">
              {state.skipped.map((item, index) => (
                <SkippedRow
                  key={`${item.sourceRow}-${item.candidateCode}-${index}`}
                  item={item}
                />
              ))}
            </div>
          </div>
        ) : null}

        {success && state.importedCount > 0 ? (
          <p className="mt-4 text-[11px] leading-5 text-emerald-100/70">
            Halaman Peserta dan daftar batch sudah diperbarui. Tidak perlu import ulang baris yang berhasil.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function SkippedRow({
  item,
}: {
  item: ParticipantImportDetail;
}) {
  return (
    <div className="r9-import-skipped p-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="r9-import-skipped__code font-mono text-xs font-semibold">
              {item.candidateCode}
            </span>
            <span className="text-[11px] text-slate-500">
              baris {item.sourceRow}
            </span>
          </div>
          <p className="r9-import-skipped__name mt-1 text-xs font-medium">
            {item.displayName}
          </p>
          {item.externalIdentifier ? (
            <p className="mt-1 text-[11px] text-slate-500">
              NIK/NIM: {item.externalIdentifier}
            </p>
          ) : null}
          {item.email ? (
            <p className="mt-1 break-all text-[11px] text-slate-500">
              Email: {item.email}
            </p>
          ) : null}
        </div>
      </div>

      {item.reason ? (
        <div className="r9-import-skipped__reason mt-3 p-3">
          <p className="text-[11px] leading-5 text-amber-100/80">
            {item.reason}
          </p>

          {item.existingName ? (
            <div className="mt-2 rounded-[10px] border border-white/[0.06] bg-black/10 p-2.5 text-[11px] leading-5 text-slate-500">
              <p>
                Data lama: <span className="text-slate-300">{item.existingCode ?? "-"} — {item.existingName}</span>
                {item.existingBatchName ? ` · ${item.existingBatchName}` : ""}
              </p>
              {item.existingExternalIdentifier ? <p>NIK/NIM lama: <span className="text-slate-400">{item.existingExternalIdentifier}</span></p> : null}
              {item.existingEmail ? <p>Email lama: <span className="text-slate-400">{item.existingEmail}</span></p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
