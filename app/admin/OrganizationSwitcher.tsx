"use client";

import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";

type OrganizationOption = {
  id: string;
  name: string;
  role?: string | null;
};

function WorkspaceSelect({
  organizations,
  activeOrganizationId,
}: {
  organizations: OrganizationOption[];
  activeOrganizationId: string;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="r9-workspace-select__control">
      <select
        name="organization_id"
        defaultValue={activeOrganizationId}
        disabled={pending}
        aria-label="Workspace aktif"
        aria-busy={pending}
        className="r9-workspace-select__input"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}{organization.role ? ` — ${organization.role}` : ""}
          </option>
        ))}
      </select>
      <span className="r9-workspace-select__signal" aria-hidden="true" />
      <span className="r9-workspace-select__chevron" aria-hidden="true">
        {pending ? "…" : "⌄"}
      </span>
    </div>
  );
}

export default function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
  switchAction,
}: {
  organizations: OrganizationOption[];
  activeOrganizationId: string;
  switchAction: (formData: FormData) => void | Promise<void>;
}) {
  const pathname = usePathname();
  const active = organizations.find((organization) => organization.id === activeOrganizationId) ?? organizations[0];

  if (!active) return null;

  if (organizations.length <= 1) {
    return (
      <div className="r9-workspace-chip" aria-label={`Workspace aktif: ${active.name}`}>
        <span className="r9-workspace-chip__signal" aria-hidden="true" />
        <span className="r9-workspace-chip__name">{active.name}</span>
      </div>
    );
  }

  return (
    <form action={switchAction} data-action-feedback="off" className="r9-workspace-select">
      <input type="hidden" name="return_to" value={pathname || "/admin"} />
      <WorkspaceSelect organizations={organizations} activeOrganizationId={activeOrganizationId} />
    </form>
  );
}
