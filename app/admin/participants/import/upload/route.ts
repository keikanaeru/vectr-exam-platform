import { NextResponse } from "next/server";

import { requireAdminWriteAccess } from "@/lib/organization-subscription";

export const dynamic = "force-dynamic";

function backToImport(request: Request) {
  return NextResponse.redirect(
    new URL("/admin/participants/import", request.url),
    {
      status: 303,
    }
  );
}

export async function GET(request: Request) {
  await requireAdminWriteAccess();
  return backToImport(request);
}

export async function POST(request: Request) {
  await requireAdminWriteAccess();
  return backToImport(request);
}
