import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "VECTR Exam Platform",
    template: "%s · VECTR Exam Platform",
  },
  description:
    "Platform ujian, simulasi, kompetisi, dan sertifikasi berbasis organisasi dari VECTR.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var light=matchMedia('(prefers-color-scheme: light)').matches;var ck='exam-platform-candidate-theme';var cp=localStorage.getItem(ck)||'auto';var cr=cp==='light'||cp==='dark'?cp:(light?'light':'dark');document.documentElement.dataset.candidateTheme=cr;document.documentElement.dataset.candidateThemePreference=cp;var ak='exam-platform-admin-theme';var ap=localStorage.getItem(ak)||'auto';var ar=ap==='light'||ap==='dark'?ap:(light?'light':'dark');document.documentElement.dataset.adminTheme=ar;document.documentElement.dataset.adminThemePreference=ap;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
