"use client";

import { useRef, useState } from "react";

const MAX_LABEL =
  "PNG/JPG/WEBP · maksimal 512 KB";

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${Math.max(
    1,
    Math.round(bytes / 1024)
  )} KB`;
}

export default function BrandLogoField() {
  const inputRef =
    useRef<HTMLInputElement>(null);

  const [fileName, setFileName] =
    useState("");

  const [fileSize, setFileSize] =
    useState("");

  return (
    <div className="mt-5">
      <span className="r9-field-label mb-2">
        Logo Organisasi
      </span>

      <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.018] p-3 transition focus-within:border-cyan-400/20 focus-within:bg-cyan-400/[0.018]">
        <input
          ref={inputRef}
          id="branding-logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file =
              event.target.files?.[0];

            setFileName(
              file?.name ?? ""
            );

            setFileSize(
              file
                ? formatSize(file.size)
                : ""
            );
          }}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label
            htmlFor="branding-logo"
            className="r9-button r9-button--secondary shrink-0 cursor-pointer"
          >
            {fileName
              ? "Ganti Logo"
              : "Pilih Logo"}
          </label>

          <div className="min-w-0 flex-1">
            <p
              className={
                fileName
                  ? "truncate text-sm font-medium text-slate-200"
                  : "text-sm text-slate-500"
              }
            >
              {fileName ||
                "Belum ada file dipilih"}
            </p>

            <p className="mt-1 text-[11px] leading-4 text-slate-600">
              {fileSize
                ? `${fileSize} · ${MAX_LABEL}`
                : MAX_LABEL}
            </p>
          </div>

          {fileName ? (
            <button
              type="button"
              onClick={() => {
                if (inputRef.current) {
                  inputRef.current.value = "";
                }

                setFileName("");
                setFileSize("");
              }}
              className="r9-button r9-button--quiet shrink-0"
            >
              Hapus pilihan
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
