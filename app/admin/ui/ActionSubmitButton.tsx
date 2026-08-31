"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export default function ActionSubmitButton({
  children,
  pendingLabel = "Memproses...",
  className = "r9-button r9-button--secondary",
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
      className={`r9-submit ${className}`}
      disabled={isDisabled}
      aria-busy={pending}
    >
      {pending ? (
        <span className="r9-button__pending" role="status">
          <span className="r9-spinner" aria-hidden="true" />
          <span>{pendingLabel}</span>
        </span>
      ) : children}
    </button>
  );
}
