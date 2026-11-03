import Image from "next/image";
import type { ReactNode } from "react";
import { formatListeningTime } from "@/lib/time";

// Outlined "sticker" card. tone="cobalt" is reserved for the #1 spot.
export function Card({
  title,
  action,
  tone = "plain",
  className = "",
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  tone?: "plain" | "cobalt";
  className?: string;
  children: ReactNode;
}) {
  const toneCls = tone === "cobalt" ? "bg-cobalt-soft text-ink" : "bg-card";
  return (
    <section className={`rounded-[18px] border-2 border-outline p-5 ${toneCls} ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title && <h2 className="font-display text-xl font-extrabold tracking-tight">{title}</h2>}
          {action && <div className="text-sm">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const STICKER_TONES = {
  lemon: "bg-lemon text-on-lemon",
  coral: "bg-coral text-on-coral",
  plain: "bg-card text-ink",
} as const;

// Small tilted tag with a hard outline, used sparingly: live, new, #1, status.
export function Sticker({
  children,
  tone = "lemon",
  tilt = -4,
  className = "",
}: {
  children: ReactNode;
  tone?: keyof typeof STICKER_TONES;
  tilt?: number;
  className?: string;
}) {
  return (
    <span
      style={{ rotate: `${tilt}deg` }}
      className={`inline-block rounded-md border-2 border-[#141414] px-2 py-0.5 font-display text-xs font-bold whitespace-nowrap ${STICKER_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

// Album cover from Last.fm, or a lettered tile when there is none.
export function Cover({
  src,
  name,
  size,
  className = "",
}: {
  src: string | null | undefined;
  name: string;
  size: number;
  className?: string;
}) {
  const box = `shrink-0 overflow-hidden rounded-lg border-2 border-outline ${className}`;
  if (src) {
    return (
      <Image src={src} alt="" width={size} height={size} className={box} style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      aria-hidden
      className={`${box} flex items-center justify-center bg-card-2 font-display font-extrabold text-muted`}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.4) }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="tabular font-display text-3xl font-extrabold tracking-tight">
        {Number(value).toLocaleString("en-US")}
      </dd>
      <dt className="text-sm text-muted">{label}</dt>
    </div>
  );
}

// Estimated listening time, always labeled "est." since plays carry no
// length. Plays stay the main metric. showGuessed spells out how much of it
// comes from songs with an unknown length; otherwise it's only in the tooltip.
export function EstTimeStat({
  seconds,
  guessedSeconds,
  showGuessed = false,
}: {
  seconds: number;
  guessedSeconds: number;
  showGuessed?: boolean;
}) {
  const guessed = seconds > 0 ? Math.round((Number(guessedSeconds) / Number(seconds)) * 100) : 0;
  return (
    <div title={guessed > 0 ? `${guessed}% of this is guessed: songs with an unknown length count as 3:30` : undefined}>
      <dd className="tabular font-display text-3xl font-extrabold tracking-tight text-ink-2">
        {formatListeningTime(Number(seconds))}
      </dd>
      <dt className="text-sm text-muted">
        listened (est.)
        {showGuessed && guessed > 0 && <>, {guessed}% guessed</>}
      </dt>
    </div>
  );
}
