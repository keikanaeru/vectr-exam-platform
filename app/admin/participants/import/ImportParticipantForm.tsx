"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  importParticipants,
  type ParticipantImportDetail,
  type ParticipantImportState,
} from "./actions";

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
  const [batchOpen, setBatchOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
  } | null>(null);

  const batchRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedBatch = safeBatches.find(
    (batch) => batch.id === selectedBatchId
  );

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (
        batchRef.current &&
        !batchRef.current.contains(event.target as Node)
      ) {
        setBatchOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setBatchOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

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
      <form action={formAction} className="liquid-card p-6 sm:p-7">
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-violet-300/60">
                Bulk Import
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Upload Data Peserta
              </h2>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-400/15 bg-violet-400/[0.07] text-sm font-bold text-violet-200 shadow-[0_0_28px_rgba(139,92,246,0.08)]">
              ↥
            </div>
          </div>

          <label className="mt-6 block text-sm font-medium text-slate-300">
            Batch Tujuan
          </label>

          <div ref={batchRef} className="relative mt-2">
            <input
              type="hidden"
              name="batch_id"
              value={selectedBatchId}
            />

            <button
              type="button"
              disabled={safeBatches.length === 0}
              onClick={() => setBatchOpen((current) => !current)}
              className={[
                "flex w-full items-center justify-between gap-3 rounded-[15px] border px-4 py-3.5 text-left text-sm transition duration-200",
                batchOpen
                  ? "border-cyan-400/25 bg-cyan-400/[0.055] text-slate-100 shadow-[0_0_28px_rgba(34,211,238,0.05)]"
                  : "border-white/[0.08] bg-white/[0.025] text-slate-300 hover:border-white/[0.14] hover:bg-white/[0.04]",
                safeBatches.length === 0
                  ? "cursor-not-allowed opacity-45"
                  : "",
              ].join(" ")}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {selectedBatch
                    ? selectedBatch.name
                    : safeBatches.length > 0
                      ? "Pilih batch peserta"
                      : "Belum ada batch"}
                </p>
                {selectedBatch ? (
                  <p className="mt-0.5 truncate font-mono text-[11px] tracking-wide text-slate-600">
                    {selectedBatch.code}
                  </p>
                ) : null}
              </div>

              <span
                className={[
                  "text-[11px] text-slate-500 transition-transform duration-200",
                  batchOpen ? "rotate-180 text-cyan-300" : "",
                ].join(" ")}
              >
                ▼
              </span>
            </button>

            {batchOpen && safeBatches.length > 0 ? (
              <div className="absolute left-0 top-[calc(100%+9px)] z-50 w-full overflow-hidden rounded-[20px] border border-white/[0.1] bg-[#07101f]/98 p-2 shadow-[0_28px_90px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
                <p className="px-3 pb-2 pt-1 text-[11px] uppercase tracking-[0.16em] text-slate-600">
                  Pilih Batch
                </p>

                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {safeBatches.map((batch) => {
                    const active = batch.id === selectedBatchId;

                    return (
                      <button
                        key={batch.id}
                        type="button"
                        onClick={() => {
                          setSelectedBatchId(batch.id);
                          setBatchOpen(false);
                        }}
                        className={[
                          "flex w-full items-center justify-between gap-3 rounded-[14px] border px-3.5 py-3 text-left transition",
                          active
                            ? "border-cyan-400/15 bg-cyan-400/[0.075]"
                            : "border-transparent hover:border-white/[0.06] hover:bg-white/[0.045]",
                        ].join(" ")}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-200">
                            {batch.name}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-slate-600">
                            {batch.code}
                          </p>
                        </div>

                        <span
                          className={
                            active
                              ? "h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.85)]"
                              : "h-2 w-2 rounded-full border border-white/[0.14]"
                          }
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <label className="mt-5 block text-sm font-medium text-slate-300">
            File Peserta
          </label>

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
            className="glass-dropzone mt-2 rounded-[20px] p-5 text-center"
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
              className="liquid-button mt-4 rounded-[12px] px-4 py-2.5 text-xs font-semibold text-slate-200"
            >
              {selectedFile ? "Ganti File" : "Pilih File"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[16px] border border-white/[0.05] bg-black/10 p-4">
              <p className="text-[11px] uppercase tracking-wider text-slate-600">
                Kolom Wajib
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Kode Peserta + Nama Peserta
              </p>
            </div>

            <div className="rounded-[16px] border border-white/[0.05] bg-black/10 p-4">
              <p className="text-[11px] uppercase tracking-wider text-slate-600">
                Duplikat
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
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
            className="liquid-button-primary mt-5 flex w-full items-center justify-center rounded-[15px] px-5 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
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
      className={[
        "relative overflow-hidden rounded-[22px] border p-5 backdrop-blur-xl",
        success
          ? "border-emerald-400/15 bg-emerald-400/[0.035]"
          : "border-rose-400/15 bg-rose-400/[0.035]",
      ].join(" ")}
    >
      <div className="relative z-10">
        <div className="flex items-start gap-3">
          <div
            className={[
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-bold",
              success
                ? "border-emerald-400/15 bg-emerald-400/[0.08] text-emerald-300"
                : "border-rose-400/15 bg-rose-400/[0.08] text-rose-300",
            ].join(" ")}
          >
            {success ? "✓" : "!"}
          </div>

          <div>
            <p
              className={
                success
                  ? "text-sm font-semibold text-emerald-200"
                  : "text-sm font-semibold text-rose-200"
              }
            >
              {success ? "Import Selesai" : "Import Gagal"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {state.message}
            </p>
          </div>
        </div>

        {success ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Metric label="Baris" value={state.totalRows} />
            <Metric label="Berhasil" value={state.importedCount} tone="good" />
            <Metric label="Dilewati" value={state.skippedCount} tone="warn" />
          </div>
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
              <span className="liquid-badge px-2.5 py-1 text-[11px] text-amber-200/80">
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
          <p className="mt-4 text-[11px] leading-5 text-emerald-100/55">
            Halaman Peserta dan daftar batch sudah diperbarui. Tidak perlu import ulang baris yang berhasil.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "good" | "warn";
}) {
  const valueClass =
    tone === "good"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : "text-slate-200";

  return (
    <div className="rounded-[15px] border border-white/[0.055] bg-black/10 p-3">
      <p className="text-[11px] uppercase tracking-wider text-slate-600">
        {label}
      </p>
      <p className={`mt-2 text-lg font-semibold ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function SkippedRow({
  item,
}: {
  item: ParticipantImportDetail;
}) {
  return (
    <div className="rounded-[15px] border border-white/[0.055] bg-black/10 p-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-cyan-300/80">
              {item.candidateCode}
            </span>
            <span className="text-[11px] text-slate-700">
              baris {item.sourceRow}
            </span>
          </div>
          <p className="mt-1 text-xs font-medium text-slate-300">
            {item.displayName}
          </p>
          {item.externalIdentifier ? (
            <p className="mt-1 text-[11px] text-slate-600">
              NIK/NIM: {item.externalIdentifier}
            </p>
          ) : null}
          {item.email ? (
            <p className="mt-1 break-all text-[11px] text-slate-600">
              Email: {item.email}
            </p>
          ) : null}
        </div>
      </div>

      {item.reason ? (
        <div className="mt-3 rounded-[12px] border border-amber-400/10 bg-amber-400/[0.025] p-3">
          <p className="text-[11px] leading-5 text-amber-100/70">
            {item.reason}
          </p>

          {item.existingName ? (
            <div className="mt-2 rounded-[10px] border border-white/[0.05] bg-black/10 p-2.5 text-[11px] leading-5 text-slate-500">
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
