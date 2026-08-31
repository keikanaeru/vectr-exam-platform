import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/app/admin/r9/ui";

export default function AdminPageHero({
  eyebrow,
  title,
  description,
  organizationName,
  status,
  backHref,
  backLabel = "Kembali",
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  organizationName?: string;
  status?: ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
}) {
  const context = backHref ? (
    <div className="r9-page-header__context-row">
      <Link href={backHref} className="r9-page-back">
        <span aria-hidden="true">{"\u2190"}</span>
        <span>{backLabel}</span>
      </Link>
      <span aria-hidden="true">/</span>
      <span>{eyebrow}</span>
    </div>
  ) : eyebrow;

  const meta = organizationName || status ? (
    <>
      {organizationName ? <span>{organizationName}</span> : null}
      {status}
    </>
  ) : undefined;

  return (
    <PageHeader
      context={context}
      title={title}
      description={description}
      meta={meta}
      actions={actions}
    />
  );
}
