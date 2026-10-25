import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

// Render the real layout into React elements with only request-bound services
// stubbed. No session is created and no API or browser state is changed.
const code = ts.transpileModule(readFileSync(new URL("../src/app/m/[slug]/layout.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

async function navigation(apiFetch) {
  const exports = {};
  const modules = {
    "react/jsx-runtime": jsxRuntime,
    "next-intl/server": { getTranslations: async () => key => key },
    "next/link": { __esModule: true, default: "a" },
    "@/components/cart": { CartProvider: "cart-provider", HeaderCartLink: "cart-link" },
    "@/components/shell": { AppHeader: "app-header" },
    "@/lib/api": { apiFetch },
  };
  vm.runInNewContext(code, { exports, require: name => {
    assert.ok(name in modules, `Unexpected import: ${name}`);
    return modules[name];
  } });
  const element = await exports.default({ params: Promise.resolve({ slug: "test-market" }), children: null });
  const elements = [];
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    elements.push(value);
    visit(value.props?.children);
    visit(value.props?.right);
  }
  visit(element);
  return elements;
}
const sellerLink = elements => elements.find(element => element.type === "a" && element.props.href === "/m/test-market/join");

test("visitors see the cart without the seller menu item", async () => {
  const elements = await navigation(async () => ({ ok: true, json: async () => ({ user: null }) }));
  assert.equal(sellerLink(elements), undefined);
  assert.ok(elements.some(element => element.type === "cart-link"));
});

test("signed-in members keep the marketplace seller link", async () => {
  const elements = await navigation(async () => ({ ok: true, json: async () => ({ user: { id: "member" } }) }));
  assert.equal(sellerLink(elements)?.props.children, "becomeASeller");
});

test("an unavailable session service keeps visitor navigation usable", async () => {
  for (const request of [async () => { throw new Error("Offline"); }, async () => ({ ok: false })]) {
    const elements = await navigation(request);
    assert.equal(sellerLink(elements), undefined);
    assert.ok(elements.some(element => element.type === "cart-link"));
  }
});
