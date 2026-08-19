"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export default function ActionSubmitButton({
  children,
  pendingLabel = "Memproses...",
  className = "liquid-button rounded-[12px] px-4 py-2.5 text-xs font-semibold",
  disabled = false,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      type="submit"
      className={className}
      disabled={isDisabled}
      aria-busy={pending}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80" aria-hidden="true" />
          <span>{pendingLabel}</span>
        </span>
      ) : children}
    </button>
  );
}
