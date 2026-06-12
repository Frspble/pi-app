"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

type ThemeSnapshot = `${ThemeMode}:${ResolvedTheme}`;
type ToggleOrigin = { x: number; y: number };

const THEME_MODE_KEY = "pi-theme-mode";
const LEGACY_THEME_KEY = "pi-theme";
const MODES: ThemeMode[] = ["system", "light", "dark"];
const listeners = new Set<() => void>();

let mediaQuery: MediaQueryList | null = null;
let mediaQueryRegistered = false;
let initialized = false;

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function isResolvedTheme(value: string | null): value is ResolvedTheme {
  return value === "light" || value === "dark";
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(THEME_MODE_KEY);
    if (isThemeMode(stored)) return stored;

    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (isResolvedTheme(legacy)) {
      localStorage.setItem(THEME_MODE_KEY, legacy);
      localStorage.removeItem(LEGACY_THEME_KEY);
      return legacy;
    }
  } catch {
    // Storage may be unavailable in private mode. Fall back to system.
  }
  return "system";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? getSystemTheme() : mode;
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.themeMode = mode;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

function getSnapshotValue(): { mode: ThemeMode; resolvedTheme: ResolvedTheme; key: ThemeSnapshot } {
  const mode = readMode();
  const resolvedTheme = resolveTheme(mode);
  return { mode, resolvedTheme, key: `${mode}:${resolvedTheme}` };
}

function getSnapshot(): ThemeSnapshot {
  return getSnapshotValue().key;
}

function getServerSnapshot(): ThemeSnapshot {
  return "system:light";
}

function notify() {
  listeners.forEach((cb) => cb());
}

function ensureSystemListener() {
  if (typeof window === "undefined" || mediaQueryRegistered) return;
  mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
  if (!mediaQuery) return;
  mediaQueryRegistered = true;

  const onChange = () => {
    if (readMode() !== "system") return;
    applyTheme("system");
    notify();
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", onChange);
  } else {
    mediaQuery.addListener(onChange);
  }
}

function ensureStorageListener() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  ensureSystemListener();
  applyTheme(readMode());
  window.addEventListener("storage", (event) => {
    if (event.key !== THEME_MODE_KEY && event.key !== LEGACY_THEME_KEY) return;
    applyTheme(readMode());
    notify();
  });
}

function subscribe(cb: () => void): () => void {
  ensureStorageListener();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function setStoredMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
    localStorage.removeItem(LEGACY_THEME_KEY);
  } catch {
    // The document can still update for this session even if storage fails.
  }
}

function runThemeTransition(mode: ThemeMode, origin?: ToggleOrigin) {
  const apply = () => {
    setStoredMode(mode);
    applyTheme(mode);
    notify();
  };

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const supportsVT = typeof document.startViewTransition === "function";

  if (!supportsVT || reduceMotion) {
    apply();
    return;
  }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  const transition = document.startViewTransition(apply);
  transition.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 450,
          easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {
      // Transition cancelled; the theme has already been applied.
    });
}

export function getNextThemeMode(mode: ThemeMode): ThemeMode {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length];
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { mode, resolvedTheme } = useMemo(() => {
    const [modePart, resolvedPart] = snapshot.split(":") as [ThemeMode, ResolvedTheme];
    return { mode: modePart, resolvedTheme: resolvedPart };
  }, [snapshot]);

  const setMode = useCallback((nextMode: ThemeMode, origin?: ToggleOrigin) => {
    ensureStorageListener();
    runThemeTransition(nextMode, origin);
  }, []);

  const cycleMode = useCallback((origin?: ToggleOrigin) => {
    ensureStorageListener();
    runThemeTransition(getNextThemeMode(readMode()), origin);
  }, []);

  return {
    mode,
    resolvedTheme,
    isDark: resolvedTheme === "dark",
    setMode,
    cycleMode,
  };
}
