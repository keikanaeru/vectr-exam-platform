"use client";

import { useEffect, useMemo, useState } from "react";

import GlassSelect from "@/app/admin/ui/GlassSelect";

type ModuleOption = {
  id: string;
  code: string;
  name: string;
  status: string;
  defaultDuration: number;
};

type InitialSection = {
  id?: string;
  moduleId: string;
  durationMinutes: number;
};

type BuilderRow = InitialSection & { key: string; durationInput: string };

function clampMinutes(value: unknown, min = 1, max = 1440) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

export default function ExamSectionsBuilder({
  modules,
  initialSections = [],
  initialTotalDuration = 60,
}: {
  modules: ModuleOption[];
  initialSections?: InitialSection[];
  initialTotalDuration?: number;
}) {
  const initial = useMemo<BuilderRow[]>(() => {
    const source = initialSections.length
      ? initialSections
      : [{ moduleId: modules[0]?.id ?? "", durationMinutes: modules[0]?.defaultDuration ?? 60 }];
    return source.map((item, index) => ({
      ...item,
      durationMinutes: clampMinutes(item.durationMinutes),
      durationInput: String(clampMinutes(item.durationMinutes)),
      key: item.id ?? `section-${index}-${item.moduleId}`,
    }));
  }, [initialSections, modules]);

  const [rows, setRows] = useState<BuilderRow[]>(initial);
  const [totalInput, setTotalInput] = useState(String(clampMinutes(initialTotalDuration, 1, 10080)));

  const totalSectionMinutes = rows.reduce(
    (sum, row) => sum + clampMinutes(row.durationInput),
    0
  );
  const totalDuration = clampMinutes(totalInput, 1, 10080);
  const bufferMinutes = Math.max(0, totalDuration - totalSectionMinutes);

  useEffect(() => {
    if (totalDuration < totalSectionMinutes) {
      setTotalInput(String(totalSectionMinutes));
    }
  }, [totalDuration, totalSectionMinutes]);

  function addSection() {
    const unused = modules.find((module) => !rows.some((row) => row.moduleId === module.id));
    const duration = clampMinutes(unused?.defaultDuration ?? modules[0]?.defaultDuration ?? 60);
    setRows((current) => [
      ...current,
      {
        key: `new-${Date.now()}-${current.length}`,
        moduleId: unused?.id ?? modules[0]?.id ?? "",
        durationMinutes: duration,
        durationInput: String(duration),
      },
    ]);
  }

  function removeSection(key: string) {
    setRows((current) => current.length <= 1 ? current : current.filter((row) => row.key !== key));
  }

  function moveSection(key: string, direction: -1 | 1) {
    setRows((current) => {
      const index = current.findIndex((row) => row.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateModule(key: string, moduleId: string) {
    const selectedModule = modules.find((item) => item.id === moduleId);
    const duration = clampMinutes(selectedModule?.defaultDuration ?? 60);
    setRows((current) => current.map((row) => row.key === key
      ? { ...row, moduleId, durationMinutes: duration, durationInput: String(duration) }
      : row));
  }

  function updateDurationDraft(key: string, raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    setRows((current) => current.map((row) => row.key === key ? { ...row, durationInput: digits } : row));
  }

  function commitDuration(key: string) {
    setRows((current) => current.map((row) => {
      if (row.key !== key) return row;
      const duration = clampMinutes(row.durationInput);
      return { ...row, durationMinutes: duration, durationInput: String(duration) };
    }));
  }

  function commitTotal() {
    const safe = Math.max(totalSectionMinutes, clampMinutes(totalInput, 1, 10080));
    setTotalInput(String(safe));
  }

  return (
    <div className="mt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-300">Sesi Modul</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-600">
            Setiap modul punya batas waktu sendiri. Setelah satu sesi selesai, peserta bisa konfirmasi kesiapan sebelum sesi berikutnya.
          </p>
        </div>
        <button
          type="button"
          onClick={addSection}
          disabled={!modules.length || rows.length >= Math.min(10, modules.length)}
          className="liquid-button shrink-0 rounded-[11px] px-3 py-2 text-xs font-semibold disabled:opacity-40"
        >
          + Tambah Modul
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {rows.map((row, index) => (
          <div key={row.key} className="rounded-[16px] border border-white/[0.06] bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-300/70">Sesi {index + 1}</p>
              <div className="flex items-center gap-1.5">
                <button type="button" aria-label={`Naikkan sesi ${index + 1}`} disabled={index === 0} onClick={() => moveSection(row.key, -1)} className="liquid-button rounded-[9px] px-2 py-1 text-[10px] disabled:opacity-30">↑</button>
                <button type="button" aria-label={`Turunkan sesi ${index + 1}`} disabled={index === rows.length - 1} onClick={() => moveSection(row.key, 1)} className="liquid-button rounded-[9px] px-2 py-1 text-[10px] disabled:opacity-30">↓</button>
                {rows.length > 1 ? (
                  <button type="button" onClick={() => removeSection(row.key)} className="ml-1 text-[11px] font-medium text-rose-300/70 hover:text-rose-200">Hapus</button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
              <GlassSelect
                name="section_module_id"
                required
                value={row.moduleId}
                onValueChange={(value) => updateModule(row.key, value)}
                placeholder="Pilih modul"
                options={modules.map((module) => ({
                  value: module.id,
                  label: module.name,
                  description: `${module.code} · ${module.status}`,
                  disabled: rows.some((other) => other.key !== row.key && other.moduleId === module.id),
                }))}
              />

              <label className="block">
                <span className="mb-2 block text-[11px] text-slate-500">Batas waktu sesi</span>
                <div className="relative">
                  <input
                    name="section_duration_minutes"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    value={row.durationInput}
                    onChange={(event) => updateDurationDraft(row.key, event.target.value)}
                    onBlur={() => commitDuration(row.key)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitDuration(row.key);
                        event.currentTarget.blur();
                      }
                    }}
                    className="field pr-14"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-600">menit</span>
                </div>
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[18px] border border-cyan-400/12 bg-cyan-400/[0.025] p-4">
        <label className="block">
          <span className="text-xs font-semibold text-cyan-100">Durasi Total Ujian · Timer Utama</span>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            Ini timer keseluruhan dari mulai ujian sampai submit akhir. Sudah mencakup semua sesi modul dan tetap berjalan saat peserta berada di halaman pergantian sesi.
          </p>
          <div className="relative mt-3">
            <input
              name="duration_minutes"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              value={totalInput}
              onChange={(event) => setTotalInput(event.target.value.replace(/\D/g, "").slice(0, 5))}
              onBlur={commitTotal}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTotal();
                  event.currentTarget.blur();
                }
              }}
              className="field pr-16"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-600">menit</span>
          </div>
        </label>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Summary label="Total sesi" value={`${totalSectionMinutes} menit`} />
          <Summary label="Buffer / jeda" value={`${bufferMinutes} menit`} />
          <Summary label="Timer utama" value={`${Math.max(totalDuration, totalSectionMinutes)} menit`} accent />
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">
          Jika angka timer utama diketik lebih kecil dari total sesi, sistem otomatis menaikkannya ke batas minimum {totalSectionMinutes} menit.
        </p>
      </div>
    </div>
  );
}

function Summary({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[13px] border border-white/[0.055] bg-black/10 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-700">{label}</p>
      <p className={`mt-1 text-xs font-semibold ${accent ? "text-cyan-200" : "text-slate-300"}`}>{value}</p>
    </div>
  );
}

