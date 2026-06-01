"use client";

import { useTheme } from "@/components/theme/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      className="theme-toggle"
      aria-label="Toggle light or dark theme"
      onClick={toggle}
      title={theme === "dark" ? "Switch to light" : "Switch to dark"}
    >
      {/* suppressHydrationWarning: the icon reflects the client's persisted theme,
          which can differ from the server's "dark" default — no flash, the
          provider resolves it on first paint. */}
      <span className="ic" aria-hidden suppressHydrationWarning>
        {theme === "dark" ? "☀" : "☾"}
      </span>
    </button>
  );
}
