"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import AppIcon from "@/app/ui/AppIcon";
import { createClient } from "@/lib/supabase/client";

type ThemePreference = "auto" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "exam-platform-admin-theme";

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.adminTheme = resolved;
  document.documentElement.dataset.adminThemePreference = preference;
}

export default function AdminAccountMenu({
  fullName,
  role,
}: {
  fullName: string;
  role: string;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [preference, setPreference] = useState<ThemePreference>("auto");
  const [signingOut, setSigningOut] = useState(false);

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
    function outside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  const chooseTheme = (next: ThemePreference) => {
    setPreference(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    delete document.documentElement.dataset.adminTheme;
    delete document.documentElement.dataset.adminThemePreference;
    router.replace("/login");
    router.refresh();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="admin-account-trigger flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-left backdrop-blur-xl transition hover:border-white/[0.14] hover:bg-white/[0.05]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-slate-300">
          <AppIcon name="user" className="h-4 w-4" />
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-xs font-medium text-slate-200">{fullName}</span>
          <span className="mt-0.5 block text-[11px] uppercase tracking-wider text-slate-500">{role}</span>
        </span>
        <span className={`text-[10px] text-slate-500 transition ${open ? "rotate-180" : ""}`}>▼</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="admin-account-menu absolute right-0 top-[calc(100%+10px)] z-[200] w-[270px] rounded-[20px] border border-white/[0.1] bg-[#07101f]/95 p-3 shadow-[0_28px_80px_rgba(0,0,0,.55)] backdrop-blur-2xl"
        >
          <div className="rounded-[15px] border border-white/[0.06] bg-white/[0.025] px-3 py-3">
            <p className="text-sm font-semibold text-slate-100">{fullName}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{role}</p>
          </div>

          <div className="mt-3">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">Tema Admin</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-[14px] border border-white/[0.06] bg-black/10 p-1.5">
              {([
                ["auto", "Auto"],
                ["light", "Terang"],
                ["dark", "Gelap"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => chooseTheme(value)}
                  className={`rounded-[10px] px-2 py-2 text-[11px] font-semibold transition ${
                    preference === value
                      ? "bg-cyan-400/[0.11] text-cyan-100"
                      : "text-slate-500 hover:bg-white/[0.045] hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="my-3 h-px bg-white/[0.06]" />

          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={signOut}
            className="flex w-full items-center justify-between rounded-[13px] border border-rose-400/10 bg-rose-400/[0.035] px-3 py-2.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/[0.07] disabled:opacity-50"
          >
            <span>{signingOut ? "Keluar..." : "Keluar dari Admin"}</span>
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
