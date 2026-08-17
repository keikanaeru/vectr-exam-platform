import type { ReactNode, SVGProps } from "react";

export type AppIconName =
  | "brand"
  | "dashboard"
  | "modules"
  | "participants"
  | "exams"
  | "platform"
  | "user"
  | "upload"
  | "download"
  | "settings"
  | "branding"
  | "questions"
  | "clock"
  | "key";

const paths: Record<AppIconName, ReactNode> = {
  brand: (
    <>
      <path d="M8 3.75h8a2.25 2.25 0 0 1 2.25 2.25v12A2.25 2.25 0 0 1 16 20.25H8A2.25 2.25 0 0 1 5.75 18V6A2.25 2.25 0 0 1 8 3.75Z" />
      <path d="M9 3.75V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.75" />
      <path d="m8.75 12.25 2.1 2.1 4.6-5.1" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" />
      <rect x="13.5" y="10.5" width="7" height="10" rx="1.5" />
      <rect x="3.5" y="13" width="7" height="7.5" rx="1.5" />
    </>
  ),
  modules: (
    <>
      <path d="M4 6.5 12 3l8 3.5-8 3.5-8-3.5Z" />
      <path d="m4 11 8 3.5 8-3.5" />
      <path d="m4 15.5 8 3.5 8-3.5" />
    </>
  ),
  participants: (
    <>
      <path d="M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M3.5 20v-1.25A4.75 4.75 0 0 1 8.25 14h2.5a4.75 4.75 0 0 1 4.75 4.75V20" />
      <path d="M16 5.1a3 3 0 0 1 0 5.8" />
      <path d="M17.5 14.35A4.5 4.5 0 0 1 20.5 18.6V20" />
    </>
  ),
  exams: (
    <>
      <path d="M7 3.5h10A2.5 2.5 0 0 1 19.5 6v14H4.5V6A2.5 2.5 0 0 1 7 3.5Z" />
      <path d="M9 2.5h6v3H9z" />
      <path d="m8 12 2 2 5-5" />
      <path d="M8 17h8" />
    </>
  ),
  platform: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.87l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.36.33.7.6 1 .29.3.68.47 1.1.5h.1v4h-.1a1.7 1.7 0 0 0-1.7.5Z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M5 14.5v4A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-4" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12" />
      <path d="m7.5 11.5 4.5 4.5 4.5-4.5" />
      <path d="M5 18.5V20h14v-1.5" />
    </>
  ),
  questions: (
    <>
      <path d="M6 4.5h12A2.5 2.5 0 0 1 20.5 7v10A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V7A2.5 2.5 0 0 1 6 4.5Z" />
      <path d="M8 9h8" />
      <path d="M8 13h5.5" />
      <path d="M8 16h3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  key: (
    <>
      <circle cx="8.5" cy="12" r="3.5" />
      <path d="M12 12h8" />
      <path d="M17 12v3" />
      <path d="M20 12v2" />
    </>
  ),
  branding: (
    <>
      <path d="M4 5.5h16v13H4z" />
      <path d="m7 15 3.2-3.2 2.3 2.3 2.2-2.2L18 15.2" />
      <circle cx="8.5" cy="9" r="1.3" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <circle cx="16" cy="7" r="2" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <circle cx="8" cy="17" r="2" />
      <path d="M4 12h5" />
      <path d="M13 12h7" />
      <circle cx="11" cy="12" r="2" />
    </>
  ),
};

export default function AppIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: AppIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
