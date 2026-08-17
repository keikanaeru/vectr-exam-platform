"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";

export type GlassSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type MenuPosition = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
};

export default function GlassSelect({
  name,
  options,
  defaultValue = "",
  value: controlledValue,
  onValueChange,
  placeholder = "Pilih opsi",
  required = false,
  disabled = false,
  emptyMessage = "Tidak ada opsi tersedia.",
}: {
  name: string;
  options: GlassSelectOption[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = controlledValue ?? internalValue;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.value === value);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const viewportPadding = 10;
    const gap = 8;
    const availableBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
    const availableAbove = rect.top - gap - viewportPadding;
    const preferAbove = availableBelow < 190 && availableAbove > availableBelow;
    const maxHeight = Math.max(120, Math.min(320, preferAbove ? availableAbove : availableBelow));
    const width = Math.min(Math.max(rect.width, 220), Math.max(180, window.innerWidth - viewportPadding * 2));
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
    );

    setMenuPosition(
      preferAbove
        ? {
            left,
            width,
            bottom: window.innerHeight - rect.top + gap,
            maxHeight,
          }
        : {
            left,
            width,
            top: rect.bottom + gap,
            maxHeight,
          }
    );
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (controlledValue === undefined) setInternalValue(defaultValue);
  }, [controlledValue, defaultValue]);

  useEffect(() => {
    if (!open) return;

    updatePosition();

    function outside(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    const refresh = () => updatePosition();

    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);

    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [open, updatePosition]);

  const menu = open && !disabled && menuPosition ? (
    <div
      ref={menuRef}
      className="glass-select-menu fixed z-[1000] overflow-y-auto rounded-[18px] border border-white/[0.1] bg-[#07101f]/[0.98] p-1.5 shadow-[0_28px_80px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
      style={{
        left: menuPosition.left,
        width: menuPosition.width,
        top: menuPosition.top,
        bottom: menuPosition.bottom,
        maxHeight: menuPosition.maxHeight,
      }}
    >
      <div role="listbox" className="space-y-1">
        {options.length === 0 ? (
          <div className="rounded-[13px] border border-white/[0.05] bg-white/[0.025] px-3 py-4 text-center text-xs leading-5 text-slate-500">
            {emptyMessage}
          </div>
        ) : null}

        {options.map((option) => {
          const active = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              role="option"
              aria-selected={active}
              onClick={() => {
                if (controlledValue === undefined) setInternalValue(option.value);
                onValueChange?.(option.value);
                setOpen(false);
                buttonRef.current?.focus();
              }}
              className={[
                "glass-select-option flex w-full items-center justify-between gap-3 rounded-[13px] border px-3 py-3 text-left transition",
                active
                  ? "border-cyan-400/12 bg-cyan-400/[0.07]"
                  : "border-transparent hover:border-white/[0.06] hover:bg-white/[0.045]",
                option.disabled ? "cursor-not-allowed opacity-35" : "",
              ].join(" ")}
            >
              <div className="min-w-0">
                <p className={active ? "truncate text-sm font-semibold text-cyan-100" : "truncate text-sm font-medium text-slate-200"}>
                  {option.label}
                </p>
                {option.description ? (
                  <p className="mt-0.5 truncate text-[11px] text-slate-600">{option.description}</p>
                ) : null}
              </div>
              <span className={active ? "h-2 w-2 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)]" : "h-2 w-2 shrink-0 rounded-full border border-white/[0.12]"} />
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} />

      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required || undefined}
        onClick={() => {
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        className={[
          "glass-select-trigger flex w-full items-center justify-between gap-3 rounded-[14px] border px-4 py-3 text-left transition",
          open
            ? "border-cyan-300/25 bg-cyan-300/[0.055] shadow-[0_0_30px_rgba(34,211,238,0.06)]"
            : "border-white/[0.08] bg-white/[0.025] hover:border-white/[0.15] hover:bg-white/[0.045]",
          disabled ? "cursor-not-allowed opacity-45" : "",
        ].join(" ")}
      >
        <div className="min-w-0">
          <p className={selected ? "truncate text-sm font-medium text-slate-100" : "truncate text-sm text-slate-500"}>
            {selected?.label ?? placeholder}
          </p>
          {selected?.description ? (
            <p className="mt-0.5 truncate text-[11px] text-slate-600">{selected.description}</p>
          ) : null}
        </div>

        <span className={open ? "rotate-180 text-xs text-cyan-300 transition" : "text-xs text-slate-600 transition"}>▼</span>
      </button>

      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
