export type AppTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "vekta-theme";

export function readStoredTheme(): AppTheme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures (private mode, quota).
  }
}

export function toggleTheme(theme: AppTheme): AppTheme {
  return theme === "dark" ? "light" : "dark";
}