import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/session";

// First gate: send anyone without a valid session to /login.
// Pages, data reads, and Server Actions check again on their own.
export function proxy(request: NextRequest) {
  const secret = process.env.SESSION_SECRET;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (secret && isValidSessionToken(token, secret)) {
    return NextResponse.next();
  }
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except the login page, the cron-triggered sync (it checks
  // CRON_SECRET itself), and static files.
  matcher: ["/((?!login|api/sync|_next/static|_next/image|favicon.ico).*)"],
};
