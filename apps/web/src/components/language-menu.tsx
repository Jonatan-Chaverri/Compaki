"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { setAppLocale } from "@/i18n/actions";
import type { AppLocale } from "@/i18n/config";

const languages: { value: AppLocale; message: string; short: string }[] = [
  { value: "es", message: "languageSpanish", short: "ES" },
  { value: "en", message: "languageEnglish", short: "EN" },
];

export function LanguageOptions() {
  const t = useTranslations("ui");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="language-options" role="group" aria-label={t("language")} aria-busy={pending}>
      <p>{t("language")}</p>
      <div>
        {languages.map((language, i) => (
          <button key={language.value} type="button" role="menuitemradio"
            ref={(element) => { buttons.current[i] = element; }}
            aria-checked={locale === language.value} disabled={pending}
            onClick={() => {
              if (locale === language.value) return;
              setFailed(false);
              startTransition(async () => {
                try {
                  await setAppLocale(language.value);
                  router.refresh();
                } catch { setFailed(true); }
              });
            }}
            onKeyDown={(event) => {
              const next = event.key === "ArrowRight" || event.key === "ArrowLeft" ? 1 - i
                : event.key === "Home" ? 0 : event.key === "End" ? 1 : null;
              if (next === null) return;
              event.preventDefault(); buttons.current[next]?.focus();
            }}>
            <span className="language-code" aria-hidden>{language.short}</span>
            <span lang={language.value}>{t(language.message)}</span>
          </button>
        ))}
      </div>
      {pending && <small role="status">{t("changingLanguage")}</small>}
      {failed && <small role="alert">{t("languageSwitchFailed")}</small>}
    </div>
  );
}
