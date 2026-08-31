"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import AppIcon, { type AppIconName } from "@/app/ui/AppIcon";

type NavItem = {
  key: string;
  href: string;
  label: string;
  icon: AppIconName;
  ownerOnly?: boolean;
};

const ITEMS: NavItem[] = [
  { key: "overview", href: "/admin", label: "Overview", icon: "dashboard" },
  { key: "exams", href: "/admin/exams", label: "Ujian", icon: "exams" },
  { key: "modules", href: "/admin/modules", label: "Bank Soal", icon: "modules" },
  { key: "participants", href: "/admin/participants", label: "Peserta", icon: "participants" },
  { key: "workspace", href: "/admin/branding", label: "Workspace", icon: "branding" },
  { key: "platform", href: "/admin/platform", label: "Platform", icon: "platform", ownerOnly: true },
];

function itemIsActive(pathname: string, item: NavItem) {
  if (item.href === "/admin") return pathname === "/admin";
  return pathname.startsWith(item.href);
}

export default function AdminNav({ isPlatformOwner }: { isPlatformOwner: boolean }) {
  const pathname = usePathname() || "/admin";
  const items = ITEMS.filter((item) => !item.ownerOnly || isPlatformOwner);

  return (
    <nav aria-label="Navigasi utama admin" className="r9-nav">
      {items.map((item) => {
        const active = itemIsActive(pathname, item);

        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            data-active={active}
            className="r9-nav__link"
          >
            <AppIcon name={item.icon} className="r9-nav__icon" />
            <span>{item.label}</span>
            <span className="r9-nav__signal" aria-hidden="true" />
          </Link>
        );
      })}
    </nav>
  );
}
