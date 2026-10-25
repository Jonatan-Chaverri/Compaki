export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "compaki-theme";
export const THEME_CHANGE_EVENT = "compaki-theme-change";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

// Run in <head> before paint. Keep the preference separate from the resolved
// theme so “system” continues to follow the device after an OS theme change.
export const themeBootstrap = `(function(){
  var preference="system";
  try { var saved=localStorage.getItem("${THEME_STORAGE_KEY}"); if(saved==="light"||saved==="dark"||saved==="system") preference=saved; } catch(e) {}
  var dark=preference==="dark"||(preference==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.themePreference=preference;
  document.documentElement.dataset.theme=dark?"dark":"light";
})();`;

export function getThemePreference(): ThemePreference {
  if (typeof document === "undefined") return "system";
  const preference = document.documentElement.dataset.themePreference;
  return isThemePreference(preference) ? preference : "system";
}

export function applyThemePreference(preference: ThemePreference): void {
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* Still works for this visit when storage is blocked. */
  }
  applyThemePreference(preference);
}

export function subscribeThemePreference(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

export function getServerThemePreference(): ThemePreference {
  return "system";
}

export function getResolvedTheme(): "light" | "dark" {
  return typeof document !== "undefined" &&
    document.documentElement.dataset.theme === "dark"
    ? "dark"
    : "light";
}

export function getServerResolvedTheme(): "light" | "dark" {
  return "light";
}
