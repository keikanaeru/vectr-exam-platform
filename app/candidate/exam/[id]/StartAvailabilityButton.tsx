"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  startsAt: string;
  hardCloseAt: string;
};

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export default function StartAvailabilityButton({ startsAt, hardCloseAt }: Props) {
  const [now, setNow] = useState<number | null>(null);
  const { pending } = useFormStatus();

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const starts = new Date(startsAt).getTime();
  const closes = new Date(hardCloseAt).getTime();
  const ready = now !== null && Number.isFinite(starts) && Number.isFinite(closes) && now >= starts && now < closes;
  const closed = now !== null && Number.isFinite(closes) && now >= closes;

  return (
    <>
      <button
        type="submit"
        disabled={!ready || pending}
        className="candidate-button-primary group flex w-full items-center justify-center rounded-[16px] px-5 py-4 font-semibold disabled:cursor-not-allowed disabled:opacity-45"
      >
        <span>{pending ? "Menyiapkan sesi..." : closed ? "Waktu Akses Berakhir" : ready ? "Mulai / Lanjutkan Ujian" : "Menunggu Waktu Mulai"}</span>
        {ready && !pending ? <span className="ml-3 transition-transform duration-200 group-hover:translate-x-1">→</span> : null}
      </button>

      {now !== null && !ready && !closed && Number.isFinite(starts) ? (
        <p className="mt-3 text-center font-mono text-[11px] text-cyan-300/70">
          Dibuka dalam {formatRemaining(starts - now)}
        </p>
      ) : null}
    </>
  );
}
