import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { env } from "./env";
import { SESSION_COOKIE, isValidSessionToken } from "./session";

export async function isLoggedIn(): Promise<boolean> {
  // The expiry check reads the clock; Partial Prefetching may render with
  // cookies but no real request, so wait for one first.
  await connection();
  const cookieStore = await cookies();
  return isValidSessionToken(cookieStore.get(SESSION_COOKIE)?.value, env.sessionSecret);
}

// Call at the top of every Server Action and data read. proxy.ts is only a
// first gate; Server Actions can be POSTed to directly.
export async function requireLogin(): Promise<void> {
  if (!(await isLoggedIn())) redirect("/login");
}
