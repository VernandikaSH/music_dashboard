"use client";

import { useActionState } from "react";
import { syncNow, type FormState } from "@/app/actions";

export function SyncButton() {
  const [state, action, pending] = useActionState<FormState, FormData>(syncNow, {});
  return (
    <form action={action} className="flex items-center gap-2">
      {state.message && !pending && <span className="text-sm text-ink-2">{state.message}</span>}
      {state.error && !pending && (
        <span role="alert" className="max-w-xs truncate text-sm text-danger" title={state.error}>
          Sync failed
        </span>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border-2 border-outline bg-card px-3 py-1.5 text-sm font-medium hover:bg-card-2 disabled:opacity-60"
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>
    </form>
  );
}
