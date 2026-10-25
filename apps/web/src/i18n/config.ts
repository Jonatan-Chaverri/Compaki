export const locales = ["es", "en"] as const;
export type AppLocale = (typeof locales)[number];
export const localeCookie = "compaki-locale";
export const defaultLocale: AppLocale = "es";
export function isAppLocale(value: unknown): value is AppLocale { return value === "es" || value === "en"; }

export function preferredLocale(cookie: string | undefined, acceptLanguage: string | null): AppLocale {
  if (isAppLocale(cookie)) return cookie;
  const languages = (acceptLanguage ?? "").split(",").map((part, index) => {
    const [tag, quality] = part.trim().split(";");
    const q = quality?.trim().startsWith("q=") ? Number(quality.trim().slice(2)) : 1;
    return { language: tag.toLowerCase().split("-")[0], quality: Number.isFinite(q) ? q : 0, index };
  }).filter(item => item.quality > 0).sort((a,b) => b.quality - a.quality || a.index - b.index);
  return languages.find(item => isAppLocale(item.language))?.language as AppLocale | undefined ?? defaultLocale;
}
