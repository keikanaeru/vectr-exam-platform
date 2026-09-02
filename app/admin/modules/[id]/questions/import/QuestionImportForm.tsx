"use client";

import { useActionState, useRef, useState } from "react";

import GlassSelect from "@/app/admin/ui/GlassSelect";
import { MetricStrip } from "@/app/admin/r9/ui";
import {
  importQuestions,
  type QuestionImportState,
} from "./actions";

const INITIAL: QuestionImportState = {
  status: "idle",
  message: "",
  totalRows: 0,
  insertedCount: 0,
  updatedCount: 0,
  skippedCount: 0,
  skipped: [],
};

export default function QuestionImportForm({ moduleId }: { moduleId: string }) {
  const action = importQuestions.bind(null, moduleId);
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);

  function setFile(file?: File) {
    if (!file || !inputRef.current) return;
    if (!file.name.toLowerCase().match(/\.(xlsx|csv)$/)) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    inputRef.current.files = transfer.files;
    setFileName(file.name);
  }

  return (
    <div className="space-y-5">
      <form action={formAction} data-action-feedback="off" className="r9-surface p-6 sm:p-7">
        <div className="relative z-10">
          <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/65">Bulk Question Import</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Upload Bank Soal</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">Excel/CSV divalidasi per baris. Baris error tidak membatalkan soal lain.</p>

          <label className="r9-field-label mt-5">Jika kode soal sudah ada</label>
          <div className="mt-2">
            <GlassSelect
              name="duplicate_mode"
              defaultValue="skip"
              options={[
                { value: "skip", label: "Lewati duplikat", description: "Data lama tidak diubah" },
                { value: "update", label: "Perbarui duplikat", description: "Kode yang sama akan di-update" },
              ]}
            />
          </div>

          <input
            ref={inputRef}
            type="file"
            name="file"
            required
            accept=".xlsx,.csv"
            className="sr-only"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
          />

          <div
            className="r9-dropzone mt-5 p-6 text-center"
            data-dragging={dragging ? "true" : "false"}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); setFile(event.dataTransfer.files?.[0]); }}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06] text-cyan-200">{fileName ? "✓" : "↥"}</div>
            <p className="mt-3 text-sm font-medium text-slate-300">{fileName || "Drop Excel / CSV di sini"}</p>
            <button type="button" onClick={() => inputRef.current?.click()} className="r9-button r9-button--secondary mt-4">{fileName ? "Ganti File" : "Pilih File"}</button>
          </div>

          <button type="submit" disabled={pending || !fileName} className="r9-button r9-button--primary mt-5 w-full disabled:opacity-40">
            {pending ? "Memvalidasi & Mengimpor..." : "Validasi & Import Soal"}
          </button>
        </div>
      </form>

      {state.status !== "idle" ? (
        <div className="r9-import-result r9-surface p-5" data-tone={state.status === "success" ? "success" : "danger"} role={state.status === "success" ? "status" : "alert"} aria-live={state.status === "success" ? "polite" : "assertive"}>
          <p className="r9-import-result__title text-sm font-semibold">{state.status === "success" ? "Import Selesai" : "Import Gagal"}</p>
          <p className="r9-import-result__message mt-2 text-xs leading-5">{state.message}</p>
          {state.status === "success" ? (
            <MetricStrip className="mt-4" items={[
              { label: "Baris", value: state.totalRows },
              { label: "Baru", value: state.insertedCount, tone: "success" },
              { label: "Update", value: state.updatedCount, tone: "accent" },
              { label: "Lewat", value: state.skippedCount, tone: "warning" },
            ]} />
          ) : null}
          {state.skipped.length ? (
            <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
              {state.skipped.map((item, index) => (
                <div key={`${item.sourceRow}-${item.code}-${index}`} className="r9-import-skipped p-3">
                  <p className="r9-import-skipped__code font-mono text-xs">{item.code} <span className="font-sans text-[11px]">baris {item.sourceRow || "-"}</span></p>
                  <p className="r9-import-skipped__question mt-1 line-clamp-2 text-[11px]">{item.questionText}</p>
                  <p className="r9-import-skipped__reason mt-2 text-[11px] leading-5">{item.reason}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
