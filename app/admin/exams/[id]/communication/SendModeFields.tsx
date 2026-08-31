"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const DAY_NAMES = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

type DateValue = {
  year: number;
  month: number;
  day: number;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getMondayFirstDay(year: number, month: number) {
  const nativeDay = new Date(year, month, 1).getDay();

  return (nativeDay + 6) % 7;
}

function dateKey(value: DateValue) {
  return value.year * 10000 + (value.month + 1) * 100 + value.day;
}

function getJakartaNowParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const map = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return {
    year: Number(map.year),
    month: Number(map.month) - 1,
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function addOneDay(value: DateValue): DateValue {
  const date = new Date(
    Date.UTC(value.year, value.month, value.day + 1)
  );

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

function formatSelectedDate(value: DateValue | null) {
  if (!value) {
    return "Pilih tanggal";
  }

  const date = new Date(
    Date.UTC(value.year, value.month, value.day, 12)
  );

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function SendModeFields() {
  const [sendMode, setSendMode] = useState<"NOW" | "SCHEDULED">("NOW");

  const [selectedDate, setSelectedDate] = useState<DateValue | null>(null);

  const [today, setToday] = useState<DateValue | null>(null);

  const [viewYear, setViewYear] = useState(2026);

  const [viewMonth, setViewMonth] = useState(0);

  const [hour, setHour] = useState(8);

  const [minute, setMinute] = useState(0);

  useEffect(() => {
    const now = getJakartaNowParts();

    const baseDate: DateValue = {
      year: now.year,
      month: now.month,
      day: now.day,
    };

    let initialDate = baseDate;
    let initialHour = now.hour + 1;

    if (initialHour > 23) {
      initialHour = 0;
      initialDate = addOneDay(baseDate);
    }

    setToday(baseDate);
    setSelectedDate(initialDate);
    setViewYear(initialDate.year);
    setViewMonth(initialDate.month);
    setHour(initialHour);
    setMinute(now.minute);
  }, []);

  const calendarDays = useMemo(() => {
    const totalDays = daysInMonth(viewYear, viewMonth);
    const startOffset = getMondayFirstDay(viewYear, viewMonth);

    const cells: Array<number | null> = [];

    for (let index = 0; index < startOffset; index += 1) {
      cells.push(null);
    }

    for (let day = 1; day <= totalDays; day += 1) {
      cells.push(day);
    }

    while (cells.length < 42) {
      cells.push(null);
    }

    return cells;
  }, [viewYear, viewMonth]);

  const scheduledValue = selectedDate
    ? `${selectedDate.year}-${pad(selectedDate.month + 1)}-${pad(
        selectedDate.day
      )}T${pad(hour)}:${pad(minute)}`
    : "";

  function previousMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((current) => current - 1);
      return;
    }

    setViewMonth((current) => current - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((current) => current + 1);
      return;
    }

    setViewMonth((current) => current + 1);
  }

  function changeHour(next: number) {
    setHour(Math.min(23, Math.max(0, Math.round(next))));
  }

  function changeMinute(next: number) {
    setMinute(Math.min(59, Math.max(0, Math.round(next))));
  }

  return (
    <div className="mt-6">
      <div>
        <p className="text-sm font-medium text-slate-300">
          Mode Pengiriman
        </p>

        <p className="mt-1 text-[11px] leading-5 text-slate-600">
          Pilih apakah campaign dikirim setelah dikonfirmasi atau
          dijadwalkan.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ModeButton
          active={sendMode === "NOW"}
          tone="cyan"
          title="Kirim Sekarang"
          description="Email dikirim setelah pratinjau, antrean pengiriman, dan konfirmasi admin."
          onClick={() => setSendMode("NOW")}
        />

        <ModeButton
          active={sendMode === "SCHEDULED"}
          tone="accent"
          title="Jadwalkan"
          description="Pilih tanggal dan jam WIB untuk pengiriman otomatis."
          onClick={() => setSendMode("SCHEDULED")}
        />
      </div>

      <input type="hidden" name="send_mode" value={sendMode} />

      {sendMode === "SCHEDULED" ? (
        <div className="r9-datetime r9-surface mt-4 overflow-hidden">
          <div className="border-b border-white/[0.06] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="r9-datetime__muted text-[11px] uppercase tracking-[0.16em]">
                  Jadwal Pengiriman
                </p>

                <p className="mt-2 text-sm font-medium capitalize text-slate-200">
                  {formatSelectedDate(selectedDate)}
                </p>

                <p className="mt-1 font-mono text-xs text-slate-500">
                  {pad(hour)}:{pad(minute)} WIB
                </p>
              </div>

              <div className="r9-datetime__zone px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider">
                  Zona Waktu
                </p>

                <p className="r9-datetime__accent-text mt-1 text-xs font-medium">
                  WIB · UTC+7
                </p>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_220px]">
            <div className="p-5">
              <div className="flex items-center justify-between gap-3">
                <IconButton
                  label="Bulan sebelumnya"
                  onClick={previousMonth}
                >
                  ←
                </IconButton>

                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-200">
                    {MONTH_NAMES[viewMonth]} {viewYear}
                  </p>

                  <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-slate-600">
                    Pilih tanggal
                  </p>
                </div>

                <IconButton
                  label="Bulan berikutnya"
                  onClick={nextMonth}
                >
                  →
                </IconButton>
              </div>

              <div className="mt-5 grid grid-cols-7 gap-1">
                {DAY_NAMES.map((day) => (
                  <div
                    key={day}
                    className="flex h-8 items-center justify-center text-[11px] font-medium uppercase tracking-wide text-slate-600"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1">
                {calendarDays.map((day, index) => {
                  if (!day) {
                    return (
                      <div
                        key={`blank-${index}`}
                        className="h-10"
                      />
                    );
                  }

                  const currentDate: DateValue = {
                    year: viewYear,
                    month: viewMonth,
                    day,
                  };

                  const isSelected = selectedDate
                    ? dateKey(currentDate) === dateKey(selectedDate)
                    : false;

                  const isToday = today
                    ? dateKey(currentDate) === dateKey(today)
                    : false;

                  const isPast = today
                    ? dateKey(currentDate) < dateKey(today)
                    : false;

                  return (
                    <button
                      key={`${viewYear}-${viewMonth}-${day}`}
                      type="button"
                      disabled={isPast}
                      onClick={() => setSelectedDate(currentDate)}
                      className={
                        isSelected
                          ? "r9-datetime__day r9-datetime__day--selected relative flex h-10 items-center justify-center text-xs font-semibold"
                          : isPast
                            ? "flex h-10 cursor-not-allowed items-center justify-center rounded-xl text-xs text-slate-800"
                            : "r9-datetime__day relative flex h-10 items-center justify-center text-xs"
                      }
                    >
                      {day}

                      {isToday && !isSelected ? (
                        <span className="r9-datetime__accent-dot absolute bottom-1 h-1 w-1 rounded-full" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="r9-datetime__time-panel border-t p-5 lg:border-l lg:border-t-0">
              <p className="r9-datetime__muted text-[11px] uppercase tracking-[0.16em]">
                Waktu
              </p>

              <p className="mt-2 text-sm font-medium text-slate-200">
                Atur jam pengiriman
              </p>

              <TimeControl
                label="Jam"
                value={hour}
                min={0}
                max={23}
                onValueChange={changeHour}
                accent="cyan"
              />

              <TimeControl
                label="Menit"
                value={minute}
                min={0}
                max={59}
                onValueChange={changeMinute}
                accent="accent"
              />

              <div className="r9-datetime__note mt-5 p-3">
                <p className="text-[11px] leading-5 text-slate-500">
                  Waktu dapat diatur hingga presisi 1 menit. Backend tetap
                  memvalidasi jadwal sebelum campaign disimpan.
                </p>
              </div>
            </div>
          </div>

          <input
            type="hidden"
            name="scheduled_at"
            value={scheduledValue}
          />

          <div className="border-t border-white/[0.06] px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="r9-datetime__note-signal mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />

              <p className="text-[11px] leading-5 text-slate-500">
                Kampanye disimpan sebagai draft terlebih dahulu. Status baru
                menjadi{" "}
                <span className="font-medium text-cyan-300">
                  SCHEDULED
                </span>{" "}
                setelah provider menerima jadwal.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="r9-datetime__note mt-4 p-4">
          <div className="flex items-start gap-3">
            <span className="r9-datetime__note-signal mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />

            <div>
              <p className="text-xs font-medium text-cyan-200">
                Kampanye Kirim Sekarang
              </p>

              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                Email tidak langsung terkirim ketika campaign disimpan.
                Admin masih harus memeriksa pratinjau, membuat antrean pengiriman, lalu
                mengonfirmasi pengiriman.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  tone,
  title,
  description,
  onClick,
}: {
  active: boolean;
  tone: "cyan" | "accent";
  title: string;
  description: string;
  onClick: () => void;
}) {
  const activeClass =
    tone === "cyan"
      ? "border-cyan-400/20 bg-cyan-400/[0.055]"
      : "border-cyan-400/20 bg-cyan-400/[0.055]";

  const dotClass =
    tone === "cyan"
      ? "bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.8)]"
      : "bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.8)]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`r9-surface-subtle relative overflow-hidden p-4 text-left transition ${
        active
          ? activeClass
          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] hover:bg-white/[0.035]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.025]">
          {active ? (
            <span className={`h-2 w-2 rounded-full ${dotClass}`} />
          ) : null}
        </span>

        <div>
          <p className="text-sm font-semibold text-slate-200">
            {title}
          </p>

          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            {description}
          </p>
        </div>
      </div>
    </button>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="r9-datetime__mini-button flex h-9 w-9 items-center justify-center text-sm"
    >
      {children}
    </button>
  );
}

function TimeControl({
  label,
  value,
  min,
  max,
  onValueChange,
  accent,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
  accent: "cyan" | "accent";
}) {
  const [draft, setDraft] = useState(pad(value));

  useEffect(() => {
    setDraft(pad(value));
  }, [value]);

  function commit(raw: string) {
    const parsed = Number.parseInt(raw, 10);
    const safe = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
    onValueChange(safe);
    setDraft(pad(safe));
  }

  const inputClass = accent === "cyan"
    ? "font-mono text-xl font-semibold text-cyan-200"
    : "r9-datetime__accent-text font-mono text-xl font-semibold";

  return (
    <div className="mt-5">
      <p className="r9-datetime__muted text-[11px] uppercase tracking-wider">{label}</p>

      <div className="mt-2 grid grid-cols-[40px_1fr_40px] items-center gap-2">
        <button
          type="button"
          onClick={() => onValueChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="r9-datetime__mini-button flex h-10 items-center justify-center text-slate-400 disabled:cursor-not-allowed disabled:opacity-30"
        >
          −
        </button>

        <div className="r9-datetime__time-input flex h-12 items-center justify-center">
          <input
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={draft}
            aria-label={`${label} ${min} sampai ${max}`}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              const next = event.target.value.replace(/\D/g, "").slice(0, 2);
              setDraft(next);
              if (next.length === 2) {
                const parsed = Number.parseInt(next, 10);
                if (Number.isFinite(parsed) && parsed > max) commit(next);
              }
            }}
            onBlur={() => commit(draft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit(draft);
                event.currentTarget.blur();
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                onValueChange(Math.min(max, value + 1));
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                onValueChange(Math.max(min, value - 1));
              }
            }}
            className={`h-full w-full bg-transparent text-center outline-none ${inputClass}`}
          />
        </div>

        <button
          type="button"
          onClick={() => onValueChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="r9-datetime__mini-button flex h-10 items-center justify-center text-slate-400 disabled:cursor-not-allowed disabled:opacity-30"
        >
          +
        </button>
      </div>
      <p className="r9-datetime__muted mt-2 text-center text-[10px]">Bisa diketik · {label === "Jam" ? "00–23" : "00–59"}</p>
    </div>
  );
}
