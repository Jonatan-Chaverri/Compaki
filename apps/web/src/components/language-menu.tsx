"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { setAppLocale } from "@/i18n/actions";
import type { AppLocale } from "@/i18n/config";
import { Icon } from "./icon";
import styles from "./language-menu.module.css";

const languages: { value: AppLocale; message: string; short: string; flag: string }[] = [
  { value: "es", message: "languageSpanish", short: "ES", flag: "🇪🇸" },
  { value: "en", message: "languageEnglish", short: "EN", flag: "🇺🇸" },
];

export function LanguageMenu() {
  const t = useTranslations("ui");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = languages.find(language => language.value === locale) ?? languages[0];

  useEffect(() => {
    if (!open) return;
    buttons.current[languages.findIndex(language => language.value === locale)]?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, locale]);

  return <div ref={root} className={styles.root} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={toggle} type="button" className={styles.toggle} aria-label={t("currentLanguage", { language: t(current.message) })}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-busy={pending}
      onClick={() => setOpen(!open)} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); }
      }}>
      <span className={styles.flag} aria-hidden="true">{current.flag}</span>
      <span aria-hidden="true">{current.short}</span>
      {pending ? <span className={styles.spinner} aria-hidden="true" /> : <Icon name="chevron" className={styles.chevron} />}
    </button>
    {open && <div id={id} role="menu" aria-label={t("language")} className={styles.menu} aria-busy={pending}>
      <p className={styles.heading}>{t("language")}</p>
      {languages.map((language, i) => <button key={language.value} ref={element => { buttons.current[i] = element; }}
        type="button" role="menuitemradio" tabIndex={-1} aria-checked={locale === language.value} disabled={pending}
        onKeyDown={event => {
          const next = event.key === "ArrowDown" ? (i + 1) % languages.length : event.key === "ArrowUp" ? (i + languages.length - 1) % languages.length : event.key === "Home" ? 0 : event.key === "End" ? languages.length - 1 : null;
          if (next === null) return;
          event.preventDefault(); buttons.current[next]?.focus();
        }}
        onClick={() => {
          if (locale === language.value) { setOpen(false); toggle.current?.focus(); return; }
          setFailed(false);
          startTransition(async () => {
            try {
              await setAppLocale(language.value);
              router.refresh();
              setOpen(false);
              toggle.current?.focus();
            } catch { setFailed(true); }
          });
        }}>
        <span className={styles.flag} aria-hidden="true">{language.flag}</span>
        <span lang={language.value}>{t(language.message)}</span>
        <span className={styles.code} aria-hidden="true">{language.short}</span>
        {locale === language.value && <span className={styles.check}><Icon name="check" className="h-3 w-3" /></span>}
      </button>)}
      {pending && <p role="status" className={styles.status}>{t("changingLanguage")}</p>}
      {failed && <p role="alert" className={styles.status}>{t("languageSwitchFailed")}</p>}
    </div>}
    {pending && !open && <span role="status" className={styles.srOnly}>{t("changingLanguage")}</span>}
  </div>;
}
