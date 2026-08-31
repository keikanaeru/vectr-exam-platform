"use client";

import { useMemo, useState } from "react";

type Section = { id: string; code: string; name: string; durationMinutes: number };
type Assignment = { id: string; candidateCode: string; displayName: string; selectedSectionIds: string[] };

export default function RemedialAssignmentMatrix({
  sections,
  assignments,
  action,
  disabled = false,
}: {
  sections: Section[];
  assignments: Assignment[];
  action: (formData: FormData) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const visibleAssignments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return assignments;
    return assignments.filter((assignment) =>
      `${assignment.candidateCode} ${assignment.displayName}`.toLowerCase().includes(needle)
    );
  }, [assignments, query]);

  return (
    <form action={action} className="mt-6">
      <div className="r9-surface-subtle flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="min-w-0 flex-1">
          <span className="r9-field-label mb-2">Cari peserta</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Kode atau nama peserta"
            className="r9-input"
            aria-label="Cari peserta remedial"
          />
        </label>
        <div className="text-[11px] leading-5 text-slate-500 sm:max-w-xs">
          <p className="font-semibold text-slate-300">{visibleAssignments.length} dari {assignments.length} peserta tampil</p>
          <p>Centang modul yang harus diulang. Urutan mengikuti urutan sesi ujian.</p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-[18px] border border-white/[0.08]">
        <table className="min-w-[720px] w-full border-collapse text-left">
          <thead className="bg-white/[0.035]">
            <tr>
              <th scope="col" className="sticky left-0 z-10 min-w-[240px] border-b border-white/[0.08] bg-[#101719] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Peserta</th>
              {sections.map((section) => (
                <th key={section.id} scope="col" className="border-b border-white/[0.08] px-3 py-3 text-center text-[11px] font-semibold text-slate-400">
                  <span className="block font-mono text-cyan-300">{section.code}</span>
                  <span className="mt-1 block max-w-[150px] text-[11px] font-medium text-slate-300">{section.name}</span>
                  <span className="mt-1 block text-[10px] font-normal text-slate-600">{section.durationMinutes} menit</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assignments.map((assignment) => {
              const matches = visibleAssignments.some((item) => item.id === assignment.id);
              return (
              <tr key={assignment.id} className={`${matches ? "" : "hidden"} border-b border-white/[0.055] last:border-b-0`}>
                <th scope="row" className="sticky left-0 z-10 bg-[#101719] px-4 py-3 align-top">
                  <span className="block font-mono text-[11px] text-cyan-300">{assignment.candidateCode}</span>
                  <span className="mt-1 block text-xs font-medium text-slate-200">{assignment.displayName}</span>
                </th>
                {sections.map((section) => (
                  <td key={section.id} className="px-3 py-3 text-center align-middle">
                    <label className="inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-[12px] border border-white/[0.08] bg-white/[0.02] p-2 transition hover:border-cyan-300/40 has-[:checked]:border-cyan-300/60 has-[:checked]:bg-cyan-300/[0.1] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-300">
                      <input
                        type="checkbox"
                        name={`assignment_${assignment.id}`}
                        value={section.id}
                        defaultChecked={assignment.selectedSectionIds.includes(section.id)}
                        disabled={disabled}
                        className="peer sr-only"
                      />
                      <span aria-hidden="true" className="text-sm text-slate-600 peer-checked:text-cyan-200">✓</span>
                      <span className="sr-only">{assignment.displayName}: {section.name}</span>
                    </label>
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!visibleAssignments.length ? <p className="mt-4 rounded-[14px] border border-white/[0.08] px-4 py-5 text-center text-sm text-slate-500">Peserta tidak ditemukan.</p> : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[11px] leading-5 text-slate-600">
          Setiap peserta aktif wajib memiliki minimal satu modul saat disimpan. Konfigurasi hanya bisa diubah ketika ujian masih DRAFT.
        </p>
        <div className="flex flex-wrap gap-2">
          <button name="clear_overrides" value="on" formNoValidate disabled={disabled} className="r9-button r9-button--quiet disabled:cursor-not-allowed disabled:opacity-40">Hapus Override</button>
          <button disabled={disabled} className="r9-button r9-button--primary disabled:cursor-not-allowed disabled:opacity-40">Simpan Modul Remedial</button>
        </div>
      </div>
    </form>
  );
}
