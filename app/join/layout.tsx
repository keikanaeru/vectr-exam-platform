import type { ReactNode } from "react";

import "@/app/candidate/candidate-system.css";

export default function JoinLayout({ children }: { children: ReactNode }) {
  return <div className="candidate-system">{children}</div>;
}
