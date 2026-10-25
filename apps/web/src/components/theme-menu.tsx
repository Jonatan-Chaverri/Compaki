"use client";
import { useTranslations } from "next-intl";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LanguageOptions } from "./language-menu";
import { Icon, type IconName } from "./icon";
import {
  getServerThemePreference,
  getThemePreference,
  setThemePreference,
  subscribeThemePreference,
  type ThemePreference,
} from "@/lib/theme";

export function ThemeOptions({ onSelect }: { onSelect?: () => void }) {
  const t = useTranslations("ui");

const OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: "light", label: t("light"), icon: "sun" },
  { value: "dark", label: t("dark"), icon: "moon" },
  { value: "system", label: t("device"), icon: "monitor" },
];

  const preference = useSyncExternalStore(
    subscribeThemePreference,
    getThemePreference,
    getServerThemePreference,
  );
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="theme-options" role="group" aria-label={t("appearance")}>
      <p>{t("appearance")}</p>
      <div>
        {OPTIONS.map((option, i) => (
          <button
            key={option.value}
            ref={(element) => {
              buttons.current[i] = element;
            }}
            type="button"
            role="menuitemradio"
            aria-checked={preference === option.value}
            onClick={() => {
              setThemePreference(option.value);
              onSelect?.();
            }}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === "ArrowRight") next = (i + 1) % OPTIONS.length;
              else if (event.key === "ArrowLeft")
                next = (i + OPTIONS.length - 1) % OPTIONS.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = OPTIONS.length - 1;
              else return;
              event.preventDefault();
              buttons.current[next]?.focus();
            }}
          >
            <Icon name={option.icon} className="h-4 w-4" />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
      <small>
        {preference === "system"
          ? t("matchesYourDeviceSAppearance")
          : t("valueAppearanceOnThisDevice", { value1: preference === "dark" ? t("dark").toLocaleLowerCase() : t("light").toLocaleLowerCase() })}
      </small>
    </div>
  );
}

/** Compact standalone control for the sign-in header, which has no account menu. */
export function ThemeMenu() {
  const t = useTranslations("ui");

  const preference = useSyncExternalStore(
    subscribeThemePreference,
    getThemePreference,
    getServerThemePreference,
  );
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    root.current
      ?.querySelector<HTMLButtonElement>(
        '[role="menuitemradio"][aria-checked="true"]',
      )
      ?.focus();
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div
      className="theme-menu"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="theme-toggle"
        aria-label={t("languageAndAppearance")}
        title={t("languageAndAppearance")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon
          name={
            preference === "dark"
              ? "moon"
              : preference === "light"
                ? "sun"
                : "monitor"
          }
          className="h-4 w-4"
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t("languageAndAppearance")}
          className="theme-popover"
        >
          <LanguageOptions />
          <ThemeOptions
            onSelect={() => {
              setOpen(false);
              toggle.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
