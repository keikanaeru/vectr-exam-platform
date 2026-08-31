"use client";

import { useEffect, useId, useRef } from "react";

export default function CandidateSubmitDialog({
  open,
  pending,
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const close = () => {
    if (!pending) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="candidate-submit-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={() => {
        onClose();
        previousFocusRef.current?.focus();
      }}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) close();
      }}
    >
      <div className="candidate-submit-dialog__panel">
        <p className="candidate-submit-dialog__context">Periksa sebelum lanjut</p>
        <h2 id={titleId} className="candidate-submit-dialog__title">{title}</h2>
        <p id={descriptionId} className="candidate-submit-dialog__description">{description}</p>
        <div className="candidate-submit-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            disabled={pending}
            className="candidate-submit-dialog__button"
          >
            Kembali mengerjakan
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending}
            className="candidate-submit-dialog__button candidate-submit-dialog__button--confirm"
          >
            {pending ? "Memproses..." : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
