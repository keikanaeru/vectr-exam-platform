import type { ReactNode } from "react";

import { PageHeader } from "@/app/admin/r9/ui";

export default function AdminPrimaryHeader({
  eyebrow,
  title,
  description,
  actions,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <PageHeader
      context={eyebrow}
      title={title}
      description={description}
      meta={aside}
      actions={actions}
    />
  );
}
