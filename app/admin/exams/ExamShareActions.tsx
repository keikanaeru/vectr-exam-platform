"use client";

import {
  useState,
} from "react";


export default function ExamShareActions({
  examId,
}: {
  examId: string;
}) {
  const [
    copied,
    setCopied,
  ] =
    useState(false);


  // =====================================
  // JOIN URL
  // =====================================

  function getJoinUrl() {
    return `${window.location.origin}/join/${examId}`;
  }


  // =====================================
  // COPY LINK
  // =====================================

  async function handleCopy() {
    const url =
      getJoinUrl();


    try {
      await navigator.clipboard.writeText(
        url
      );


      setCopied(
        true
      );


      window.setTimeout(
        () => {
          setCopied(
            false
          );
        },
        2000
      );
    } catch (
      error
    ) {
      console.error(
        "COPY EXAM LINK ERROR:",
        error
      );


      // =================================
      // FALLBACK
      // =================================

      const textarea =
        document.createElement(
          "textarea"
        );


      textarea.value =
        url;


      textarea.style.position =
        "fixed";


      textarea.style.opacity =
        "0";


      document.body.appendChild(
        textarea
      );


      textarea.focus();
      textarea.select();


      document.execCommand(
        "copy"
      );


      document.body.removeChild(
        textarea
      );


      setCopied(
        true
      );


      window.setTimeout(
        () => {
          setCopied(
            false
          );
        },
        2000
      );
    }
  }


  // =====================================
  // OPEN LINK
  // =====================================

  function handleOpen() {
    window.open(
      getJoinUrl(),
      "_blank",
      "noopener,noreferrer"
    );
  }


  // =====================================
  // UI
  // =====================================

  return (
    <div className="grid gap-2 sm:grid-cols-2">

      <button
        type="button"
        onClick={
          handleCopy
        }
        className="liquid-button flex items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-xs font-semibold text-slate-200"
      >

        <span>
          {copied
            ? "✓"
            : "⧉"}
        </span>


        <span>
          {copied
            ? "Link Tersalin"
            : "Copy Link"}
        </span>

      </button>


      <button
        type="button"
        onClick={
          handleOpen
        }
        className="liquid-button flex items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-xs font-semibold text-slate-200"
      >

        <span>
          ↗
        </span>


        <span>
          Buka Link
        </span>

      </button>

    </div>
  );
}