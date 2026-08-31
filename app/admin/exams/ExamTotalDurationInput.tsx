"use client";

import { useState } from "react";

function clamp(value: string, min: number, max: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

export default function ExamTotalDurationInput({
  defaultValue,
  minimum = 1,
}: {
  defaultValue: number;
  minimum?: number;
}) {
  const min = Math.max(1, Math.round(minimum));
  const [draft, setDraft] = useState(String(Math.max(min, Math.round(defaultValue || min))));

  function commit() {
    setDraft(String(clamp(draft, min, 10080)));
  }

  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-xs font-semibold text-slate-300">Durasi Total Ujian · Timer Utama</span>
      <span className="mb-2 block text-[11px] leading-5 text-slate-600">
        Timer keseluruhan ujian. Sudah termasuk sesi modul dan tetap berjalan saat pergantian sesi.
      </span>
      <div className="relative">
        <input
          name="duration_minutes"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          required
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").slice(0, 5))}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
              event.currentTarget.blur();
            }
          }}
          className="r9-input pr-16"
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-600">menit</span>
      </div>
      {min > 1 ? <p className="mt-2 text-[11px] text-cyan-300/65">Minimum sesuai total batas sesi: {min} menit.</p> : null}
    </label>
  );
}
