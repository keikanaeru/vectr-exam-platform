"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type PendingAction = {
  label: string;
};

function getSubmitLabel(event: SubmitEvent, form: HTMLFormElement) {
  const explicitLabel = form.dataset.actionLabel?.trim();
  if (explicitLabel) return explicitLabel;

  const submitter = event.submitter;
  if (submitter instanceof HTMLElement) {
    const pendingLabel = submitter.dataset.pendingLabel?.trim();
    if (pendingLabel) return pendingLabel;

    const visibleLabel = submitter.textContent?.replace(/\s+/gu, " ").trim();
    if (visibleLabel) return visibleLabel;
  }

  return "Memproses perubahan...";
}

export default function AdminActionFeedback() {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const pendingFormRef = useRef<HTMLFormElement | null>(null);
  const navigationKey = `${usePathname()}?${useSearchParams().toString()}`;
  const lastNavigationKeyRef = useRef(navigationKey);

  function clearPending() {
    pendingFormRef.current?.removeAttribute("aria-busy");
    pendingFormRef.current = null;
    setPendingAction(null);
  }

  useEffect(() => {
    const handleSubmit = (event: SubmitEvent) => {
      if (event.defaultPrevented) return;

      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.actionFeedback === "off") return;
      if (form.getAttribute("method")?.toLowerCase() === "get") return;

      pendingFormRef.current?.removeAttribute("aria-busy");
      pendingFormRef.current = form;
      setPendingAction({ label: getSubmitLabel(event, form) });
      form.setAttribute("aria-busy", "true");
    };

    document.addEventListener("submit", handleSubmit);
    window.addEventListener("pagehide", clearPending);

    return () => {
      document.removeEventListener("submit", handleSubmit);
      window.removeEventListener("pagehide", clearPending);
      clearPending();
    };
  }, []);

  useEffect(() => {
    if (lastNavigationKeyRef.current === navigationKey) return;
    lastNavigationKeyRef.current = navigationKey;
    clearPending();
  }, [navigationKey]);

  if (!pendingAction) return null;

  return (
    <div
      className="r9-action-feedback"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="r9-action-feedback__panel">
        <span className="r9-action-feedback__spinner" aria-hidden="true" />
        <span className="r9-action-feedback__copy">
          <strong>Memproses</strong>
          <span>{pendingAction.label}</span>
        </span>
      </div>
    </div>
  );
}
