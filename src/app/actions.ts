"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireLogin } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  createSessionToken,
  safeEqual,
} from "@/lib/session";
import { db } from "@/lib/supabase";
import { fillMissingCovers } from "@/lib/covers";
import { runSync } from "@/lib/sync";
import type { BlockKind } from "@/lib/data";

export type FormState = { error?: string; message?: string };

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (!safeEqual(password, env.dashboardPassword)) {
    // Slow down guessing a little.
    await new Promise((r) => setTimeout(r, 1000));
    return { error: "Wrong password." };
  }
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(env.sessionSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  redirect("/");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function syncNow(_prev: FormState): Promise<FormState> {
  await requireLogin();
  try {
    const { inserted } = await runSync();
    refresh();
    return { message: inserted === 1 ? "1 new play." : `${inserted} new plays.` };
  } catch (err) {
    refresh();
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

const BLOCK_KINDS: BlockKind[] = ["artist", "track", "channel"];

function readBlockForm(formData: FormData) {
  const kind = String(formData.get("kind")) as BlockKind;
  const value = String(formData.get("value") ?? "");
  if (!BLOCK_KINDS.includes(kind) || !value) throw new Error("Invalid block request.");
  return { kind, value, label: String(formData.get("label") ?? value) };
}

export async function block(formData: FormData) {
  await requireLogin();
  const { kind, value, label } = readBlockForm(formData);
  const { error } = await db()
    .from("blocklist")
    .upsert({ kind, value, label }, { onConflict: "kind,value", ignoreDuplicates: true });
  if (error) throw new Error(`Blocking: ${error.message}`);
  refresh();
}

// A fixed name is a new key with no cover yet; look it up right away instead
// of waiting for the next sync.
async function lookUpNewCovers() {
  try {
    await fillMissingCovers(3);
  } catch {
    // the next sync retries
  }
}

// Only same-site paths, so a crafted form can't redirect elsewhere.
function safeNext(formData: FormData): string {
  const next = String(formData.get("next") ?? "/");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function fixTrack(formData: FormData) {
  await requireLogin();
  const trackKey = String(formData.get("key") ?? "");
  const artist = String(formData.get("artist") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!trackKey || !artist || !title) throw new Error("Artist and title are required.");
  const { error } = await db().rpc("fix_track", { p_track_key: trackKey, p_artist: artist, p_title: title });
  if (error) throw new Error(`Fixing track: ${error.message}`);
  await lookUpNewCovers();
  redirect(safeNext(formData));
}

export async function fixArtist(formData: FormData) {
  await requireLogin();
  const artistKey = String(formData.get("key") ?? "");
  const artist = String(formData.get("artist") ?? "").trim();
  if (!artistKey || !artist) throw new Error("Artist is required.");
  const { error } = await db().rpc("fix_artist", { p_artist_key: artistKey, p_artist: artist });
  if (error) throw new Error(`Fixing artist: ${error.message}`);
  await lookUpNewCovers();
  redirect(safeNext(formData));
}

export async function removeAlias(formData: FormData) {
  await requireLogin();
  const kind = String(formData.get("kind"));
  const fromKey = String(formData.get("from_key") ?? "");
  if ((kind !== "artist" && kind !== "track") || !fromKey) throw new Error("Invalid fix.");
  const { error } = await db().rpc("remove_alias", { p_kind: kind, p_from_key: fromKey });
  if (error) throw new Error(`Removing fix: ${error.message}`);
  refresh();
}

// "Maybe not music" review: Keep marks the track as music so it leaves the queue.
export async function keepTrack(formData: FormData) {
  await requireLogin();
  const trackKey = String(formData.get("key") ?? "");
  if (!trackKey) throw new Error("Invalid keep request.");
  const { error } = await db()
    .from("kept_tracks")
    .upsert({ track_key: trackKey, label: String(formData.get("label") ?? trackKey) }, { onConflict: "track_key" });
  if (error) throw new Error(`Keeping track: ${error.message}`);
  refresh();
}

export async function unkeepTrack(formData: FormData) {
  await requireLogin();
  const trackKey = String(formData.get("key") ?? "");
  if (!trackKey) throw new Error("Invalid request.");
  const { error } = await db().from("kept_tracks").delete().eq("track_key", trackKey);
  if (error) throw new Error(`Undoing keep: ${error.message}`);
  refresh();
}

export async function unblock(formData: FormData) {
  await requireLogin();
  const { kind, value } = readBlockForm(formData);
  const { error } = await db().from("blocklist").delete().eq("kind", kind).eq("value", value);
  if (error) throw new Error(`Unblocking: ${error.message}`);
  refresh();
}

// A suggested merge that isn't the same song or artist: stop suggesting it.
export async function dismissMerge(formData: FormData) {
  await requireLogin();
  const kind = String(formData.get("kind"));
  const fromKey = String(formData.get("from_key") ?? "");
  const toKey = String(formData.get("to_key") ?? "");
  if ((kind !== "artist" && kind !== "track") || !fromKey || !toKey) throw new Error("Invalid request.");
  const { error } = await db()
    .from("merge_dismissals")
    .upsert({ kind, from_key: fromKey, to_key: toKey }, { onConflict: "kind,from_key,to_key", ignoreDuplicates: true });
  if (error) throw new Error(`Dismissing suggestion: ${error.message}`);
  refresh();
}
