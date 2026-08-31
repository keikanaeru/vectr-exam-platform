import type { ReactNode } from "react";

import "./auth.css";

export default function AdminAuthLayout({ children }: { children: ReactNode }) {
  return <div className="admin-auth-system">{children}</div>;
}
