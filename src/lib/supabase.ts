import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | undefined;

// Server-only client using the secret key. The browser never talks to Supabase.
export function db(): SupabaseClient {
  client ??= createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
