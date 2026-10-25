import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Execute the same head script and preference module used by the app. This
// checks first paint and browser-only behavior without changing OS settings.
function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const themeCode = compile("../src/lib/theme.ts");
const syncCode = compile("../src/components/theme-sync.tsx");

function browser({ saved = null, dark = false, blocked = false } = {}) {
  const root = { dataset: { theme: "light" } };
  const media = Object.assign(new EventTarget(), { matches: dark });
  const window = Object.assign(new EventTarget(), { matchMedia: () => media });
  const stored = new Map(saved === null ? [] : [["compaki-theme", saved]]);
  const context = vm.createContext({
    window, document: { documentElement: root }, Event,
    localStorage: {
      getItem(key) { if (blocked) throw Error("Storage unavailable"); return stored.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw Error("Storage unavailable"); stored.set(key, value); },
    },
  });
  const theme = {};
  vm.runInContext(`(function(exports){${themeCode}\n})`, context)(theme);
  vm.runInContext(theme.themeBootstrap, context);
  let cleanup;
  let dialogUpdates = 0;
  const startSync = () => {
    const syncExports = {};
    const requireModule = name => {
      if (name === "react") return { useEffect: effect => { cleanup = effect(); } };
      if (name === "@/lib/theme") return theme;
      if (name === "@/lib/stellar-wallets") return { syncStellarWalletTheme: () => { dialogUpdates++; } };
      throw Error(`Unexpected import: ${name}`);
    };
    vm.runInContext(`(function(exports, require){${syncCode}\n})`, context)(syncExports, requireModule);
    syncExports.ThemeSync();
  };
  return {
    root, theme, stored, startSync,
    stopSync: () => cleanup?.(),
    get dialogUpdates() { return dialogUpdates; },
    setDevice(value) { media.matches = value; media.dispatchEvent(new Event("change")); },
    storageChange(value, key = "compaki-theme") {
      window.dispatchEvent(Object.assign(new Event("storage"), { key, newValue: value }));
    },
  };
}

test("first paint follows the device until an explicit preference is saved", () => {
  assert.equal(browser().root.dataset.theme, "light");
  assert.equal(browser({ dark: true }).root.dataset.theme, "dark");
  assert.equal(browser({ saved: "light", dark: true }).root.dataset.theme, "light");
  assert.equal(browser({ saved: "dark" }).root.dataset.theme, "dark");
  assert.equal(browser({ saved: "system", dark: true }).root.dataset.themePreference, "system");
});

test("invalid or blocked storage falls back to the device and remains usable", () => {
  assert.equal(browser({ saved: "invalid", dark: true }).root.dataset.theme, "dark");
  const page = browser({ blocked: true, dark: true });
  page.theme.setThemePreference("light");
  assert.equal(page.root.dataset.theme, "light");
  assert.equal(page.theme.getThemePreference(), "light");
});

test("the chosen mode survives a new page load", () => {
  const page = browser();
  page.theme.setThemePreference("dark");
  const nextPage = browser({ saved: page.stored.get("compaki-theme") });
  assert.equal(nextPage.root.dataset.theme, "dark");
  assert.equal(nextPage.theme.getResolvedTheme(), "dark");
});

test("automatic mode follows device changes while explicit choices stay fixed", () => {
  const page = browser();
  page.startSync();
  page.setDevice(true);
  assert.equal(page.root.dataset.theme, "dark");
  page.theme.setThemePreference("light");
  page.setDevice(false);
  page.setDevice(true);
  assert.equal(page.root.dataset.theme, "light");
  page.theme.setThemePreference("system");
  assert.equal(page.root.dataset.theme, "dark");
  page.setDevice(false);
  assert.equal(page.root.dataset.theme, "light");
  assert.ok(page.dialogUpdates > 0);
});

test("other tabs and cleared storage update the theme without reloading", () => {
  const page = browser();
  page.startSync();
  page.storageChange("dark");
  assert.equal(page.root.dataset.theme, "dark");
  page.storageChange("light", "unrelated-setting");
  assert.equal(page.root.dataset.theme, "dark");
  page.storageChange(null, null);
  assert.equal(page.root.dataset.themePreference, "system");
  assert.equal(page.root.dataset.theme, "light");
});

test("synchronization removes its listeners when unmounted", () => {
  const page = browser();
  page.startSync();
  page.stopSync();
  page.setDevice(true);
  page.storageChange("dark");
  assert.equal(page.root.dataset.theme, "light");
});
