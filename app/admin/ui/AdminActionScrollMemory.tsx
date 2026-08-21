"use client";

import { useEffect } from "react";

const STORAGE_KEY = "vectr-admin-action-scroll";
const MAX_AGE_MS = 45_000;

type StoredScroll = {
  pathname: string;
  y: number;
  at: number;
};

export default function AdminActionScrollMemory() {
  useEffect(() => {
    const restore = () => {
      try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        window.sessionStorage.removeItem(STORAGE_KEY);
        const saved = JSON.parse(raw) as StoredScroll;
        if (
          saved.pathname !== window.location.pathname ||
          !Number.isFinite(saved.y) ||
          Date.now() - saved.at > MAX_AGE_MS
        ) {
          return;
        }

        // Tunggu hasil server action selesai ditampilkan agar posisi scroll tidak
        // kalah oleh layout/reflow halaman baru.
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            window.scrollTo({ top: Math.max(0, saved.y), behavior: "auto" });
          });
        });
      } catch {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    };

    const remember = (event: Event) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      if (!event.target.closest(".admin-shell")) return;
      try {
        const payload: StoredScroll = {
          pathname: window.location.pathname,
          y: window.scrollY,
          at: Date.now(),
        };
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Storage tidak boleh membuat action gagal.
      }
    };

    restore();
    document.addEventListener("submit", remember, true);
    return () => document.removeEventListener("submit", remember, true);
  }, []);

  return null;
}
