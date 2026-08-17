"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import AppIcon, { type AppIconName } from "@/app/ui/AppIcon";

type NavItem = {
  key: string;
  href: string;
  label: string;
  icon: AppIconName;
  ownerOnly?: boolean;
};

const ITEMS: NavItem[] = [
  { key: "dashboard", href: "/admin", label: "Dashboard", icon: "dashboard" },
  { key: "modules", href: "/admin/modules", label: "Modul", icon: "modules" },
  { key: "participants", href: "/admin/participants", label: "Peserta", icon: "participants" },
  { key: "exams", href: "/admin/exams", label: "Ujian", icon: "exams" },
  { key: "branding", href: "/admin/branding", label: "Branding", icon: "branding" },
  { key: "platform", href: "/admin/platform", label: "Platform", icon: "platform", ownerOnly: true },
];

function itemIsActive(pathname: string, item: NavItem) {
  if (item.href === "/admin") return pathname === "/admin";
  return pathname.startsWith(item.href);
}

export default function AdminNav({ isPlatformOwner }: { isPlatformOwner: boolean }) {
  const pathname = usePathname() || "/admin";
  const items = useMemo(() => ITEMS.filter((item) => !item.ownerOnly || isPlatformOwner), [isPlatformOwner]);
  const activeKey = items.find((item) => itemIsActive(pathname, item))?.key ?? "dashboard";
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, opacity: 0 });
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const targetKey = hoveredKey ?? activeKey;

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const update = () => {
      const target = itemRefs.current[targetKey];
      if (!target) {
        setIndicator((current) => ({ ...current, opacity: 0 }));
        return;
      }
      setIndicator({ left: target.offsetLeft, width: target.offsetWidth, opacity: 1 });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [targetKey, pathname, items.length]);

  return (
    <div
      ref={navRef}
      onMouseLeave={() => setHoveredKey(null)}
      className="liquid-nav-rail relative flex min-w-max items-center gap-1 overflow-hidden rounded-[18px] p-1.5"
    >
      <div
        aria-hidden="true"
        className="liquid-nav-orb absolute bottom-1.5 top-1.5 rounded-[14px]"
        style={{ left: indicator.left, width: indicator.width, opacity: indicator.opacity }}
      />

      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Link
            key={item.key}
            ref={(node) => { itemRefs.current[item.key] = node; }}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onMouseEnter={() => setHoveredKey(item.key)}
            onFocus={() => setHoveredKey(item.key)}
            onBlur={() => setHoveredKey(null)}
            className={[
              "admin-nav-link group relative z-10 flex items-center gap-2 rounded-[14px] px-3.5 py-2.5 text-sm transition-[color,transform] duration-200",
              active ? "text-white" : "text-slate-500 hover:text-slate-200",
            ].join(" ")}
          >
            <span
              className={[
                "admin-nav-icon flex h-7 w-7 items-center justify-center rounded-[9px] border transition duration-200",
                active
                  ? "border-cyan-300/20 bg-cyan-300/[0.09] text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.12)]"
                  : "border-white/[0.06] bg-white/[0.025] text-slate-600 group-hover:border-white/[0.1] group-hover:text-slate-300",
              ].join(" ")}
            >
              <AppIcon name={item.icon} className="h-4 w-4" />
            </span>
            <span className="admin-nav-label whitespace-nowrap font-medium">{item.label}</span>
            {active ? <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.9)]" /> : null}
          </Link>
        );
      })}
    </div>
  );
}
