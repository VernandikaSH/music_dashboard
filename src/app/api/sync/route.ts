import { env } from "@/lib/env";
import { safeEqual } from "@/lib/session";
import { runSync } from "@/lib/sync";

export const maxDuration = 60;

// Called hourly by GitHub Actions: POST with "Authorization: Bearer <CRON_SECRET>".
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env.cronSecret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runSync();
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
