import type { ReactNode } from "react";

import "./candidate-system.css";

export default function CandidateLayout({ children }: { children: ReactNode }) {
  return <div className="candidate-system">{children}</div>;
}
