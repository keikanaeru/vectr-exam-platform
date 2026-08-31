"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  document.documentElement.dataset.adminTheme = resolveTheme(preference);
  document.documentElement.dataset.adminThemePreference = preference;
}

export default function AdminAccountMenu({ fullName, role }: { fullName: string; role: string }) {
  const router = useRouter();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
    if (!open) return;

    function outside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }

    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

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
    <div ref={rootRef} className="r9-account">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        className="r9-account__trigger"
      >
        <span className="r9-account__avatar" aria-hidden="true">
          <AppIcon name="user" />
        </span>
        <span className="r9-account__identity">
          <span className="r9-account__name">{fullName}</span>
          <span className="r9-account__role">{role}</span>
        </span>
        <span className="r9-account__chevron" aria-hidden="true">{open ? "⌃" : "⌄"}</span>
      </button>

      {open ? (
        <div id={panelId} className="r9-account__panel" aria-label="Pengaturan akun admin">
          <div className="r9-account__summary">
            <strong>{fullName}</strong>
            <span>{role}</span>
          </div>

          <fieldset className="r9-theme-choice">
            <legend>Tema admin</legend>
            <div className="r9-theme-choice__options">
              {([[
                "auto",
                "Auto",
              ], [
                "light",
                "Terang",
              ], [
                "dark",
                "Gelap",
              ]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={preference === value}
                  onClick={() => chooseTheme(value)}
                  className="r9-theme-choice__option"
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            disabled={signingOut}
            onClick={signOut}
            className="r9-account__signout"
          >
            <span>{signingOut ? "Keluar..." : "Keluar dari Admin"}</span>
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
