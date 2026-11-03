// Everything is stored in UTC and shown in Asia/Jakarta (WIB, UTC+7, no DST).
export const TIME_ZONE = "Asia/Jakarta";
const WIB_OFFSET = "+07:00";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const isoDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatDateTime(d: Date | string): string {
  return dateTimeFmt.format(new Date(d));
}

export function formatDate(d: Date | string): string {
  return dateFmt.format(new Date(d));
}

// "YYYY-MM-DD" of the WIB calendar day containing d.
export function wibDateString(d: Date): string {
  return isoDateFmt.format(d);
}

// Start of a WIB calendar day given as "YYYY-MM-DD".
export function wibDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00${WIB_OFFSET}`);
}

export function formatRelative(d: Date | string, now: Date): string {
  const minutes = Math.round((now.getTime() - new Date(d).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return formatDateTime(d);
}

// Estimated listening time: "~45 min", "~3.5 hrs", "~120 hrs".
export function formatListeningTime(seconds: number): string {
  const hours = seconds / 3600;
  if (hours < 1) return `~${Math.round(seconds / 60)} min`;
  if (hours < 10) return `~${hours.toFixed(1).replace(/\.0$/, "")} hrs`;
  return `~${Math.round(hours).toLocaleString("en-US")} hrs`;
}

// "3:30"
export function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
