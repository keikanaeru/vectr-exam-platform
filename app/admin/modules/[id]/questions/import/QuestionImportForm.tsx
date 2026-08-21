"use client";

import { useActionState, useRef, useState } from "react";

import GlassSelect from "@/app/admin/ui/GlassSelect";
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
      <form action={formAction} className="liquid-card p-6 sm:p-7">
        <div className="relative z-10">
          <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/65">Bulk Question Import</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Upload Bank Soal</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">Excel/CSV divalidasi per baris. Baris error tidak membatalkan soal lain.</p>

          <label className="mt-5 block text-sm text-slate-400">Jika kode soal sudah ada</label>
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
            className="glass-dropzone mt-5 rounded-[20px] p-6 text-center"
            data-dragging={dragging ? "true" : "false"}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); setFile(event.dataTransfer.files?.[0]); }}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06] text-cyan-200">{fileName ? "✓" : "↥"}</div>
            <p className="mt-3 text-sm font-medium text-slate-300">{fileName || "Drop Excel / CSV di sini"}</p>
            <button type="button" onClick={() => inputRef.current?.click()} className="liquid-button mt-4 rounded-[12px] px-4 py-2.5 text-xs font-semibold text-slate-200">{fileName ? "Ganti File" : "Pilih File"}</button>
          </div>

          <button type="submit" disabled={pending || !fileName} className="liquid-button-primary mt-5 w-full rounded-[14px] px-4 py-3 text-sm font-semibold disabled:opacity-40">
            {pending ? "Memvalidasi & Mengimpor..." : "Validasi & Import Soal"}
          </button>
        </div>
      </form>

      {state.status !== "idle" ? (
        <div className={state.status === "success" ? "rounded-[22px] border border-emerald-400/15 bg-emerald-400/[0.035] p-5" : "rounded-[22px] border border-rose-400/15 bg-rose-400/[0.035] p-5"}>
          <p className={state.status === "success" ? "text-sm font-semibold text-emerald-200" : "text-sm font-semibold text-rose-200"}>{state.status === "success" ? "Import Selesai" : "Import Gagal"}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">{state.message}</p>
          {state.status === "success" ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Baris" value={state.totalRows} />
              <Metric label="Baru" value={state.insertedCount} />
              <Metric label="Update" value={state.updatedCount} />
              <Metric label="Lewat" value={state.skippedCount} />
            </div>
          ) : null}
          {state.skipped.length ? (
            <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
              {state.skipped.map((item, index) => (
                <div key={`${item.sourceRow}-${item.code}-${index}`} className="rounded-[14px] border border-amber-400/10 bg-amber-400/[0.025] p-3">
                  <p className="font-mono text-xs text-cyan-300/80">{item.code} <span className="font-sans text-[11px] text-slate-700">baris {item.sourceRow || "-"}</span></p>
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{item.questionText}</p>
                  <p className="mt-2 text-[11px] leading-5 text-amber-100/70">{item.reason}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[14px] border border-white/[0.055] bg-black/10 p-3"><p className="text-[11px] uppercase tracking-wider text-slate-600">{label}</p><p className="mt-1 text-lg font-semibold text-slate-200">{value}</p></div>;
}
