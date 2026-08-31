"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

export default function ConfirmSubmitButton({
  children,
  message,
  className = "r9-button r9-button--danger",
  disabled = false,
  title,
  pendingLabel = "Memproses...",
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  disabled?: boolean;
  title?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const wasPendingRef = useRef(false);
  const headingId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (pending) {
      wasPendingRef.current = true;
      return;
    }

    if (wasPendingRef.current) {
      wasPendingRef.current = false;
      setOpen(false);
    }
  }, [pending]);

  const closeDialog = () => {
    if (pending) return;
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        disabled={disabled || pending}
        aria-busy={pending}
        title={title}
        onClick={(event) => {
          formRef.current = event.currentTarget.form;
          setOpen(true);
        }}
      >
        {pending ? pendingLabel : children}
      </button>

      <dialog
        ref={dialogRef}
        className="r9-confirm-dialog"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => {
          setOpen(false);
          triggerRef.current?.focus();
        }}
        onMouseDown={(event) => {
          if (event.currentTarget === event.target) closeDialog();
        }}
      >
        <div className="r9-confirm-dialog__panel">
          <p className="r9-confirm-dialog__eyebrow">Konfirmasi</p>
          <h2 id={headingId} className="r9-confirm-dialog__title">
            Konfirmasi tindakan
          </h2>
          <p id={descriptionId} className="r9-confirm-dialog__description">
            {message}
          </p>

          <div className="r9-confirm-dialog__actions">
            <button
              ref={cancelRef}
              type="button"
              onClick={closeDialog}
              className="r9-button r9-button--secondary"
              disabled={pending}
            >
              Batal
            </button>
            <button
              type="button"
              className="r9-button r9-button--danger"
              disabled={pending}
              aria-busy={pending}
              onClick={() => {
                const form = formRef.current;
                if (!form) return;

                if (!form.checkValidity()) {
                  setOpen(false);
                  window.setTimeout(() => form.requestSubmit(), 0);
                  return;
                }

                form.requestSubmit();
              }}
            >
              {pending ? (
                <span className="r9-button__pending" role="status">
                  <span className="r9-spinner" aria-hidden="true" />
                  {pendingLabel}
                </span>
              ) : (
                children
              )}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
