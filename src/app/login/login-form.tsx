"use client";

import { useActionState } from "react";
import { login, type FormState } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="mt-5 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-2">Password</span>
        <input
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          className="rounded-lg border-2 border-outline bg-page px-3 py-2 outline-none focus:border-cobalt"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border-2 border-outline bg-cobalt px-3 py-2 font-display font-bold text-on-cobalt disabled:opacity-60"
      >
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
