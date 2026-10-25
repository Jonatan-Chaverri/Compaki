"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon, type IconName } from "./icon";
import {
  getServerThemePreference,
  getThemePreference,
  setThemePreference,
  subscribeThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "Device", icon: "monitor" },
];

export function ThemeOptions({ onSelect }: { onSelect?: () => void }) {
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    getThemePreference,
    getServerThemePreference,
  );
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="theme-options" role="group" aria-label="Appearance">
      <p>Appearance</p>
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
          ? "Matches your device’s appearance."
          : `${preference === "dark" ? "Dark" : "Light"} appearance on this device.`}
      </small>
    </div>
  );
}

/** Compact standalone control for the sign-in header, which has no account menu. */
export function ThemeMenu() {
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
        aria-label="Appearance"
        title="Appearance"
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
          aria-label="Appearance settings"
          className="theme-popover"
        >
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
