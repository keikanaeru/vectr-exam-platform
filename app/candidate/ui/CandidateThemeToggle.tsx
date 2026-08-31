"use client";

import { useEffect, useId, useRef, useState } from "react";

type ThemePreference = "auto" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "exam-platform-candidate-theme";

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.candidateTheme = resolved;
  document.documentElement.dataset.candidateThemePreference = preference;
}

export default function CandidateThemeToggle({ compact = false }: { compact?: boolean }) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [preference, setPreference] = useState<ThemePreference>("auto");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const initial: ThemePreference = saved === "light" || saved === "dark" || saved === "auto" ? saved : "auto";
    setPreference(initial);
    applyTheme(initial);

    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const current = (window.localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ?? "auto";
      if (current === "auto") applyTheme("auto");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (next: ThemePreference) => {
    setPreference(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    setOpen(false);
  };

  const label = preference === "auto" ? "Auto" : preference === "light" ? "Terang" : "Gelap";
  const symbol = preference === "auto" ? "◐" : preference === "light" ? "☀" : "☾";

  return (
    <div ref={rootRef} className="candidate-theme-control relative z-[70]">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Pilih tema tampilan"
        className="candidate-theme-button liquid-button gap-2 rounded-[12px] px-3 py-2 text-xs font-semibold"
      >
        <span aria-hidden="true">{symbol}</span>
        {compact ? null : <span>{label}</span>}
      </button>
      {open ? (
        <div id={panelId} aria-label="Pilihan tema tampilan" className="candidate-theme-menu absolute right-0 mt-2 w-40 rounded-[16px] border border-white/[0.09] bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur-xl">
          {([
            ["auto", "◐", "Ikuti perangkat"],
            ["light", "☀", "Terang"],
            ["dark", "☾", "Gelap"],
          ] as const).map(([value, icon, text]) => (
            <button
              key={value}
              type="button"
              aria-pressed={preference === value}
              onClick={() => choose(value)}
              className={`flex w-full items-center gap-2 rounded-[11px] px-3 py-2 text-left text-xs transition ${preference === value ? "bg-cyan-400/[0.09] text-cyan-100" : "text-slate-300 hover:bg-white/[0.05]"}`}
            >
              <span aria-hidden="true">{icon}</span>
              <span>{text}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
