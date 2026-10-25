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

async function navigation() {
  const exports = {};
  const modules = {
    "react/jsx-runtime": jsxRuntime,
    "@/components/cart": { CartProvider: "cart-provider", HeaderCartLink: "cart-link" },
    "@/components/shell": { AppHeader: "app-header" },
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

test("marketplace navigation keeps the cart without a global seller link", async () => {
  const elements = await navigation();
  assert.equal(sellerLink(elements), undefined);
  assert.ok(elements.some(element => element.type === "cart-link"));
});
