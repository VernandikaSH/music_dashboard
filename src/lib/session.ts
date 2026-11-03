import { createHmac, timingSafeEqual } from "node:crypto";

// Shared by proxy.ts and server code, so no "server-only" import here.
// The cookie holds "<expiry ms>.<hmac>"; there is no user id because there is one user.

export const SESSION_COOKIE = "lt_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(secret: string, now = Date.now()): string {
  const expiry = String(now + SESSION_MAX_AGE_S * 1000);
  return `${expiry}.${sign(expiry, secret)}`;
}

export function isValidSessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const [expiry, signature] = token.split(".");
  if (!expiry || !signature) return false;
  if (!(Number(expiry) > now)) return false;
  return safeEqual(signature, sign(expiry, secret));
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
