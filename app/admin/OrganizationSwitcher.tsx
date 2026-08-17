"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

type OrganizationOption = {
  id: string;
  name: string;
  role?: string | null;
};

export default function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
  switchAction,
}: {
  organizations: OrganizationOption[];
  activeOrganizationId: string;
  switchAction: (
    formData: FormData
  ) => void | Promise<void>;
}) {
  const pathname =
    usePathname();


  const [open, setOpen] =
    useState(false);

  const rootRef =
    useRef<HTMLDivElement>(
      null
    );

  const active =
    organizations.find(
      (organization) =>
        organization.id ===
        activeOrganizationId
    ) ??
    organizations[0];

  useEffect(() => {
    function handlePointerDown(
      event: MouseEvent
    ) {
      if (
        rootRef.current &&
        !rootRef.current.contains(
          event.target as Node
        )
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.key ===
        "Escape"
      ) {
        setOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handlePointerDown
    );

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointerDown
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, []);

  if (!active) {
    return null;
  }

  if (
    organizations.length <= 1
  ) {
    return (
      <div className="flex min-w-[190px] items-center justify-between gap-3 rounded-[14px] border border-white/[0.07] bg-white/[0.025] px-4 py-3">

        <span className="truncate text-sm font-medium text-slate-200">
          {active.name}
        </span>

        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />

      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative min-w-[190px]"
    >

      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() =>
          setOpen(
            (current) =>
              !current
          )
        }
        className={
          open
            ? "flex w-full items-center justify-between gap-4 rounded-[14px] border border-cyan-400/25 bg-cyan-400/[0.055] px-4 py-3 text-left shadow-[0_0_28px_rgba(34,211,238,0.06)] transition"
            : "flex w-full items-center justify-between gap-4 rounded-[14px] border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-left transition hover:border-white/[0.12] hover:bg-white/[0.045]"
        }
      >

        <div className="min-w-0">

          <p className="truncate text-sm font-semibold text-slate-100">
            {active.name}
          </p>

        </div>

        <span
          className={
            open
              ? "shrink-0 rotate-180 text-xs text-cyan-300 transition"
              : "shrink-0 text-xs text-slate-500 transition"
          }
          aria-hidden="true"
        >
          ▼
        </span>

      </button>


      {open ? (

        <div className="absolute left-0 top-[calc(100%+8px)] z-[100] w-full min-w-[240px] overflow-hidden rounded-[18px] border border-white/[0.09] bg-[#07101f]/95 p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl">

          <div className="px-3 pb-2 pt-2">

            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-600">
              Ganti Workspace
            </p>

          </div>

          <form
            action={
              switchAction
            }
          >

            <input
              type="hidden"
              name="return_to"
              value={
                pathname ||
                "/admin"
              }
            />


            <div
              role="listbox"
              aria-label="Organisasi"
              className="space-y-1"
            >

              {organizations.map(
                (
                  organization
                ) => {
                  const selected =
                    organization.id ===
                    active.id;

                  return (
                    <button
                      key={
                        organization.id
                      }
                      type="submit"
                      name="organization_id"
                      value={
                        organization.id
                      }
                      role="option"
                      aria-selected={
                        selected
                      }
                      disabled={
                        selected
                      }
                      className={
                        selected
                          ? "flex w-full cursor-default items-center justify-between gap-3 rounded-[13px] border border-cyan-400/12 bg-cyan-400/[0.07] px-3 py-3 text-left"
                          : "flex w-full items-center justify-between gap-3 rounded-[13px] border border-transparent px-3 py-3 text-left transition hover:border-white/[0.06] hover:bg-white/[0.045]"
                      }
                    >

                      <div className="min-w-0">

                        <p
                          className={
                            selected
                              ? "truncate text-sm font-semibold text-cyan-100"
                              : "truncate text-sm font-medium text-slate-200"
                          }
                        >
                          {
                            organization.name
                          }
                        </p>

                        {
                          organization.role
                            ? (

                              <p className="mt-0.5 truncate text-[11px] uppercase tracking-[0.12em] text-slate-600">
                                {
                                  organization.role
                                }
                              </p>

                            )
                            : null
                        }

                      </div>

                      <span
                        className={
                          selected
                            ? "h-2 w-2 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.85)]"
                            : "h-2 w-2 shrink-0 rounded-full border border-white/[0.12]"
                        }
                      />

                    </button>
                  );
                }
              )}

            </div>

          </form>

        </div>

      ) : null}

    </div>
  );
}
