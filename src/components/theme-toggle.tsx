"use client";

import { useLayoutEffect } from "react";
import { THEME_KEY } from "@/lib/theme";

function readTheme(): "light" | "dark" {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

// The label comes from CSS (dark: variant), not React state, so the server
// HTML and the client always agree.
export function ThemeToggle() {
  // In development, Strict Mode's remount resets <html> attributes; put the
  // theme back before paint. A no-op in production.
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", readTheme());
  }, []);

  function toggle() {
    const next = readTheme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // still switches for this page view
    }
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <button type="button" onClick={toggle} className="text-sm text-muted hover:text-ink">
      <span className="dark:hidden">Dark mode</span>
      <span className="hidden dark:inline">Light mode</span>
    </button>
  );
}
