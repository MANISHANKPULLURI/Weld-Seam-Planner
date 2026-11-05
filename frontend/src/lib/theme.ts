import { useEffect } from "react";

export type ThemeMode = "dark" | "light";

const KEY = "theme";

export function currentTheme(): ThemeMode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function loadSavedTheme(): ThemeMode {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* private mode: fall through to the default */
  }
  return "dark";
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.setAttribute("data-theme", mode);
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent("themechange"));
}

/**
 * keep data-theme (what the CSS reads) and the themechange broadcast
 * in sync with the `dark` class (what the toggle writes) on any route
 */
export function useThemeSync() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const sync = () => {
      const dark = root.classList.contains("dark");
      root.setAttribute("data-theme", dark ? "dark" : "light");
      window.dispatchEvent(new CustomEvent("themechange"));
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
}
