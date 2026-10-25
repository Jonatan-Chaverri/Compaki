"use client";

import { useEffect } from "react";
import {
  applyThemePreference,
  getThemePreference,
  isThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

import { syncStellarWalletTheme } from "@/lib/stellar-wallets";

/** Keeps tabs and the device preference in sync; the head script handles first paint. */
export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onDeviceChange = () => {
      if (getThemePreference() === "system") applyThemePreference("system");
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        applyThemePreference(
          isThemePreference(event.newValue) ? event.newValue : "system",
        );
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, syncStellarWalletTheme);
    media.addEventListener("change", onDeviceChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, syncStellarWalletTheme);
      media.removeEventListener("change", onDeviceChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}
