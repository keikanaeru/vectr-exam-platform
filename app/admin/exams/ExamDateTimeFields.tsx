"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const DAY_NAMES = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

type DateValue = {
  year: number;
  month: number;
  day: number;
};

type DateTimeValue = {
  date: DateValue;
  hour: number;
  minute: number;
};

type CalendarCell = {
  date: DateValue;
  currentMonth: boolean;
};

type Accent = "cyan" | "blue" | "violet";

type PickerProps = {
  label: string;
  description: string;
  name: string;
  value: DateTimeValue | null;
  onChange: (value: DateTimeValue) => void;
  accent: Accent;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(value: DateValue) {
  return value.year * 10000 + (value.month + 1) * 100 + value.day;
}

function addMinutes(value: DateTimeValue, amount: number): DateTimeValue {
  const date = new Date(
    Date.UTC(
      value.date.year,
      value.date.month,
      value.date.day,
      value.hour,
      value.minute + amount
    )
  );

  return {
    date: {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth(),
      day: date.getUTCDate(),
    },
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

function getJakartaNow(): DateTimeValue {
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
    date: {
      year: Number(map.year),
      month: Number(map.month) - 1,
      day: Number(map.day),
    },
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function fromIsoToWib(value?: string | null): DateTimeValue | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: {
      year: Number(map.year),
      month: Number(map.month) - 1,
      day: Number(map.day),
    },
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function formValue(value: DateTimeValue | null) {
  if (!value) return "";

  return `${value.date.year}-${pad(value.date.month + 1)}-${pad(
    value.date.day
  )}T${pad(value.hour)}:${pad(value.minute)}`;
}

function formatDate(value: DateValue) {
  const date = new Date(
    Date.UTC(value.year, value.month, value.day, 12)
  );

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildCalendar(year: number, month: number): CalendarCell[] {
  const firstDay = new Date(
    Date.UTC(year, month, 1)
  );

  const offset =
    (firstDay.getUTCDay() + 6) % 7;

  const cells: CalendarCell[] = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(
      Date.UTC(
        year,
        month,
        1 - offset + index
      )
    );

    const cellDate: DateValue = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth(),
      day: date.getUTCDate(),
    };

    cells.push({
      date: cellDate,
      currentMonth:
        cellDate.year === year &&
        cellDate.month === month,
    });
  }

  return cells;
}

function getAccentClasses(accent: Accent) {
  if (accent === "cyan") {
    return {
      border: "border-cyan-400/15",
      background: "bg-cyan-400/[0.04]",
      text: "text-cyan-200",
      dot: "bg-cyan-400",
      selected:
        "border-cyan-300/25 bg-cyan-400/[0.12] text-cyan-100",
    };
  }

  if (accent === "blue") {
    return {
      border: "border-blue-400/15",
      background: "bg-blue-400/[0.04]",
      text: "text-blue-200",
      dot: "bg-blue-400",
      selected:
        "border-blue-300/25 bg-blue-400/[0.12] text-blue-100",
    };
  }

  return {
    border: "border-violet-400/15",
    background: "bg-violet-400/[0.04]",
    text: "text-violet-200",
    dot: "bg-violet-400",
    selected:
      "border-violet-300/25 bg-violet-400/[0.12] text-violet-100",
  };
}

export default function ExamDateTimeFields({
  initialLoginOpenAt = null,
  initialStartsAt = null,
  initialHardCloseAt = null,
  compact = false,
}: {
  initialLoginOpenAt?: string | null;
  initialStartsAt?: string | null;
  initialHardCloseAt?: string | null;
  compact?: boolean;
}) {
  const [loginOpen, setLoginOpen] =
    useState<DateTimeValue | null>(null);

  const [startsAt, setStartsAt] =
    useState<DateTimeValue | null>(null);

  const [hardClose, setHardClose] =
    useState<DateTimeValue | null>(null);

  useEffect(() => {
    const initialLogin = fromIsoToWib(initialLoginOpenAt);
    const initialStart = fromIsoToWib(initialStartsAt);
    const initialClose = fromIsoToWib(initialHardCloseAt);

    if (initialLogin && initialStart && initialClose) {
      setLoginOpen(initialLogin);
      setStartsAt(initialStart);
      setHardClose(initialClose);
      return;
    }

    const now = getJakartaNow();
    const login = addMinutes(now, 60);
    const start = addMinutes(login, 15);
    const close = addMinutes(start, 120);

    setLoginOpen(login);
    setStartsAt(start);
    setHardClose(close);
  }, [initialLoginOpenAt, initialStartsAt, initialHardCloseAt]);

  return (
    <div className={`${compact ? "mt-4" : "mt-6"} rounded-[24px] border border-white/[0.06] bg-white/[0.022] p-4`}>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-200">
            Jadwal WIB
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Atur waktu login, mulai ujian, dan batas akhir ujian.
          </p>
        </div>

        <div className="shrink-0 rounded-[14px] border border-cyan-400/10 bg-cyan-400/[0.035] px-3 py-2">
          <p className="text-[11px] uppercase tracking-wider text-slate-600">
            Zona
          </p>

          <p className="mt-1 text-[11px] font-medium text-cyan-200">
            WIB
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">

        <DateTimePicker
          label="Login Dibuka"
          description="Peserta mulai dapat masuk melalui Tautan Peserta."
          name="login_open_at"
          value={loginOpen}
          onChange={setLoginOpen}
          accent="cyan"
        />

        <DateTimePicker
          label="Ujian Mulai"
          description="Waktu resmi pelaksanaan ujian dimulai."
          name="starts_at"
          value={startsAt}
          onChange={setStartsAt}
          accent="blue"
        />

        <DateTimePicker
          label="Hard Close"
          description="Batas akhir seluruh aktivitas ujian."
          name="hard_close_at"
          value={hardClose}
          onChange={setHardClose}
          accent="violet"
        />

      </div>

      <div className="mt-4 rounded-[16px] border border-white/[0.05] bg-black/10 p-3">
        <div className="flex items-start gap-3">

          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />

          <p className="text-[11px] leading-5 text-slate-500">
            Jadwal menggunakan WIB dan dapat diatur sampai presisi satu menit.
            Server tetap memvalidasi urutan waktu sebelum ujian dibuat.
          </p>

        </div>
      </div>

    </div>
  );
}

function DateTimePicker({
  label,
  description,
  name,
  value,
  onChange,
  accent,
}: PickerProps) {
  const [open, setOpen] =
    useState(false);

  const [viewYear, setViewYear] =
    useState(2026);

  const [viewMonth, setViewMonth] =
    useState(0);

  const [today, setToday] =
    useState<DateValue | null>(null);

  useEffect(() => {
    setToday(
      getJakartaNow().date
    );
  }, []);

  useEffect(() => {
    if (!value) return;

    setViewYear(
      value.date.year
    );

    setViewMonth(
      value.date.month
    );
  }, [value]);

  const calendarDays =
    useMemo(
      () =>
        buildCalendar(
          viewYear,
          viewMonth
        ),
      [
        viewYear,
        viewMonth,
      ]
    );

  const accentClasses =
    getAccentClasses(
      accent
    );

  function previousMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(
        (current) =>
          current - 1
      );
      return;
    }

    setViewMonth(
      (current) =>
        current - 1
    );
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(
        (current) =>
          current + 1
      );
      return;
    }

    setViewMonth(
      (current) =>
        current + 1
    );
  }

  function selectDate(
    date: DateValue
  ) {
    if (!value) return;

    onChange({
      ...value,
      date,
    });

    if (
      date.year !== viewYear ||
      date.month !== viewMonth
    ) {
      setViewYear(
        date.year
      );

      setViewMonth(
        date.month
      );
    }
  }

  function changeHour(next: number) {
    if (!value) return;
    onChange({ ...value, hour: Math.min(23, Math.max(0, Math.round(next))) });
  }

  function changeMinute(next: number) {
    if (!value) return;
    onChange({ ...value, minute: Math.min(59, Math.max(0, Math.round(next))) });
  }

  return (
    <div>

      <input
        type="hidden"
        name={name}
        value={formValue(value)}
      />

      <button
        type="button"
        onClick={() =>
          setOpen(
            (current) =>
              !current
          )
        }
        className={`w-full rounded-[18px] border ${accentClasses.border} ${accentClasses.background} p-4 text-left transition hover:bg-white/[0.05]`}
      >
        <div className="flex items-center justify-between gap-4">

          <div className="min-w-0">

            <div className="flex items-center gap-2">

              <span
                className={`h-1.5 w-1.5 rounded-full ${accentClasses.dot}`}
              />

              <p className="text-xs font-medium text-slate-300">
                {label}
              </p>

            </div>

            <p className="mt-2 text-sm font-semibold leading-6 text-white">
              {value
                ? `${formatDate(value.date)} · ${pad(value.hour)}:${pad(
                    value.minute
                  )} WIB`
                : "Memuat jadwal..."}
            </p>

            <p className="mt-1 text-[11px] leading-5 text-slate-600">
              {description}
            </p>

          </div>

          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${accentClasses.border} bg-white/[0.025] ${accentClasses.text}`}
          >
            {open
              ? "↑"
              : "↓"}
          </div>

        </div>
      </button>

      {open && value ? (

        <div className="liquid-enter mt-2 overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#09111f]/95 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl">

          <div className="p-4">

            <div className="grid grid-cols-[38px_1fr_38px] items-center gap-3">

              <MiniButton
                label="Bulan sebelumnya"
                onClick={previousMonth}
              >
                ←
              </MiniButton>

              <div className="min-w-0 text-center">

                <p className="truncate text-sm font-semibold text-slate-100">
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </p>

                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-600">
                  Kalender
                </p>

              </div>

              <MiniButton
                label="Bulan berikutnya"
                onClick={nextMonth}
              >
                →
              </MiniButton>

            </div>

            <div className="mt-5 grid grid-cols-7 gap-1">

              {DAY_NAMES.map(
                (day) => (
                  <div
                    key={day}
                    className="flex h-7 items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                  >
                    {day}
                  </div>
                )
              )}

            </div>

            <div className="grid grid-cols-7 gap-1">

              {calendarDays.map(
                (
                  cell,
                  index
                ) => {
                  const selected =
                    dateKey(cell.date) ===
                    dateKey(value.date);

                  const isToday =
                    today
                      ? dateKey(cell.date) ===
                        dateKey(today)
                      : false;

                  const past =
                    today
                      ? dateKey(cell.date) <
                        dateKey(today)
                      : false;

                  return (
                    <button
                      key={`${cell.date.year}-${cell.date.month}-${cell.date.day}-${index}`}
                      type="button"
                      disabled={past}
                      onClick={() =>
                        selectDate(
                          cell.date
                        )
                      }
                      className={
                        selected
                          ? `relative flex h-10 items-center justify-center rounded-xl border text-xs font-semibold ${accentClasses.selected}`
                          : past
                            ? "flex h-10 cursor-not-allowed items-center justify-center rounded-xl text-xs text-slate-800"
                            : cell.currentMonth
                              ? "relative flex h-10 items-center justify-center rounded-xl border border-transparent text-xs text-slate-400 transition hover:border-white/[0.07] hover:bg-white/[0.045] hover:text-white"
                              : "relative flex h-10 items-center justify-center rounded-xl border border-transparent text-xs text-slate-700 transition hover:bg-white/[0.03] hover:text-slate-400"
                      }
                    >
                      {cell.date.day}

                      {isToday &&
                      !selected ? (
                        <span
                          className={`absolute bottom-1 h-1 w-1 rounded-full ${accentClasses.dot}`}
                        />
                      ) : null}

                    </button>
                  );
                }
              )}

            </div>

          </div>

          <div className="border-t border-white/[0.06] bg-white/[0.012] p-4">

            <div className="flex items-center justify-between gap-3">

              <div>

                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-600">
                  Waktu
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Atur jam dan menit
                </p>

              </div>

              <div
                className={`rounded-xl border ${accentClasses.border} ${accentClasses.background} px-3 py-2`}
              >
                <p
                  className={`font-mono text-xs font-semibold ${accentClasses.text}`}
                >
                  {pad(value.hour)}:{pad(value.minute)} WIB
                </p>
              </div>

            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">

              <TimeStepper
                label="Jam"
                value={value.hour}
                min={0}
                max={23}
                onValueChange={changeHour}
                accentClasses={accentClasses}
              />

              <TimeStepper
                label="Menit"
                value={value.minute}
                min={0}
                max={59}
                onValueChange={changeMinute}
                accentClasses={accentClasses}
              />

            </div>

            <button
              type="button"
              onClick={() =>
                setOpen(false)
              }
              className="liquid-button mt-4 w-full rounded-[13px] px-4 py-3 text-xs font-semibold text-slate-200"
            >
              Selesai
            </button>

          </div>

        </div>

      ) : null}

    </div>
  );
}

function MiniButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-sm text-slate-400 transition hover:border-white/[0.12] hover:bg-white/[0.055] hover:text-white"
    >
      {children}
    </button>
  );
}

function TimeStepper({
  label,
  value,
  min,
  max,
  onValueChange,
  accentClasses,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
  accentClasses: {
    border: string;
    background: string;
    text: string;
    dot: string;
    selected: string;
  };
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

  return (
    <div className="rounded-[16px] border border-white/[0.055] bg-black/10 p-3">
      <p className="text-center text-[11px] uppercase tracking-[0.14em] text-slate-600">
        {label}
      </p>

      <div className="mt-3 grid grid-cols-[32px_1fr_32px] items-center gap-2">
        <button
          type="button"
          onClick={() => onValueChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex h-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-sm text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          −
        </button>

        <div className={`flex h-11 min-w-0 items-center justify-center rounded-xl border ${accentClasses.border} ${accentClasses.background}`}>
          <input
            type="text"
            inputMode="numeric"
            aria-label={`${label} ${min} sampai ${max}`}
            value={draft}
            maxLength={2}
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
            className={`h-full w-full bg-transparent text-center font-mono text-lg font-semibold outline-none ${accentClasses.text}`}
          />
        </div>

        <button
          type="button"
          onClick={() => onValueChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex h-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-sm text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          +
        </button>
      </div>

      <p className="mt-2 text-center text-[10px] text-slate-700">
        Bisa diketik · {label === "Jam" ? "00–23" : "00–59"}
      </p>
    </div>
  );
}
