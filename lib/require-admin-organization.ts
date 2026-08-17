import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin-context";

export async function requireAdminOrganization() {
  const context = await getAdminContext();

  if (!context) {
    redirect("/login");
  }

  if (
    !context.organizationId ||
    !context.activeOrganization
  ) {
    throw new Error(
      "Organisasi aktif belum dipilih."
    );
  }

  return {
    context,
    organizationId:
      context.organizationId,
    organization:
      context.activeOrganization,
  };
}