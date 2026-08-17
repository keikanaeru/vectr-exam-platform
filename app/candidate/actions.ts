"use server";

import {
  cookies,
} from "next/headers";

import {
  redirect,
} from "next/navigation";

export async function logoutCandidate() {
  const cookieStore =
    await cookies();

  cookieStore.delete(
    "candidate_session"
  );

  redirect(
    "/candidate/login"
  );
}