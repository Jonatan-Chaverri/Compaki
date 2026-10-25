import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as jsxRuntime from "react/jsx-runtime";
import { createTranslator } from "next-intl";
import ts from "typescript";

const messages = JSON.parse(readFileSync(new URL("../messages/es.json", import.meta.url), "utf8"));
const code = ts.transpileModule(readFileSync(new URL("../src/components/user-menu.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

function menuLinks(user) {
  const exports = {};
  // Render the actual open menu without creating sessions or running effects.
  const modules = {
    "react/jsx-runtime": jsxRuntime,
    react: {
      useState: initial => [initial === "loading" ? (user ? "in" : "out") : initial === null ? user : initial === false ? true : initial, () => {}],
      useEffect: () => {}, useRef: () => ({ current: null }),
    },
    "next-intl": { useTranslations: () => createTranslator({ locale: "es", messages, namespace: "ui" }) },
    "next/link": { __esModule: true, default: "a" },
    "next/navigation": { usePathname: () => "/marketplaces", useRouter: () => ({}) },
    "@/components/cavos-provider": { useCompakiWallet: () => ({}) },
    "@/components/icon": { Icon: "icon" },
    "./theme-menu": { ThemeOptions: "theme-options" },
  };
  vm.runInNewContext(code, { exports, require: name => {
    assert.ok(name in modules, `Unexpected import: ${name}`);
    return modules[name];
  } });
  const links = [];
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value.type === "a") links.push(value.props);
    visit(value.props?.children);
  }
  visit(exports.UserMenu());
  return links;
}
const account = isSeller => ({ id: "test", name: "Test", email: null, isSeller });

test("guests and non-sellers can find Quiero ser vendedor in the account menu", () => {
  for (const user of [null, account(false)]) {
    const links = menuLinks(user);
    assert.ok(links.some(link => link.href === "/sell" && link.children.includes("Quiero ser vendedor")));
    assert.ok(!links.some(link => link.href === "/vendor"));
  }
});

test("a global seller sees their dashboard instead, without needing a marketplace membership", () => {
  const links = menuLinks(account(true));
  assert.ok(links.some(link => link.href === "/vendor"));
  assert.ok(!links.some(link => link.href === "/sell"));
});
