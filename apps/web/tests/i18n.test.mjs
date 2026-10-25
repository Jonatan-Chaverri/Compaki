import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createTranslator } from "next-intl";
import { parse } from "@formatjs/icu-messageformat-parser";

const root = new URL("../", import.meta.url);
const catalogs = Object.fromEntries(["en", "es"].map(locale => [locale,
  JSON.parse(readFileSync(new URL(`messages/${locale}.json`, root), "utf8"))]));
const exports = {};
const code = ts.transpileModule(readFileSync(new URL("src/i18n/config.ts", root), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
vm.runInNewContext(code, { exports });

function argumentsOf(elements, values = {}) {
  for (const item of elements) {
    if (item.type === 1) values[item.value] = "Example";
    else if (item.type >= 2 && item.type <= 4) values[item.value] = 2;
    else if (item.type === 5 || item.type === 6) {
      values[item.value] = item.type === 6 ? 2 : "other";
      for (const option of Object.values(item.options)) argumentsOf(option.value, values);
    }
  }
  return values;
}

test("saved language takes precedence; unsupported values use browser preferences or Spanish", () => {
  assert.equal(exports.preferredLocale("es", "en-US,en;q=0.9"), "es");
  assert.equal(exports.preferredLocale("en", "es-CR"), "en");
  assert.equal(exports.preferredLocale("fr", "de;q=1,es-CR;q=0.8,en;q=0.5"), "es");
  assert.equal(exports.preferredLocale(undefined, "es;q=0,en-GB;q=0.6"), "en");
  assert.equal(exports.preferredLocale(undefined, "fr,de;q=0.5"), "es");
  assert.equal(exports.preferredLocale(undefined, null), "es");
});

test("catalogs have the same keys, valid ICU syntax, and matching interpolation arguments", () => {
  assert.deepEqual(Object.keys(catalogs.es.ui).sort(), Object.keys(catalogs.en.ui).sort());
  for (const [key, english] of Object.entries(catalogs.en.ui)) {
    const spanish = catalogs.es.ui[key];
    assert.ok(spanish.trim(), key);
    assert.deepEqual(Object.keys(argumentsOf(parse(spanish))).sort(), Object.keys(argumentsOf(parse(english))).sort(), key);
    for (const locale of ["es", "en"]) {
      const t = createTranslator({ locale, messages: catalogs[locale], namespace: "ui", onError: error => { throw error; } });
      const result = t(key, argumentsOf(parse(catalogs[locale].ui[key])));
      assert.ok(result && !result.includes("[object Object]"), `${locale}.${key}`);
    }
  }
});

test("every static translation reference exists and supplies its placeholders", () => {
  const sourceRoot = new URL("src/", root).pathname;
  function files(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
      ? files(path.join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
  }
  for (const file of files(sourceRoot)) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === "t" && ts.isStringLiteral(node.arguments[0])) {
        const key = node.arguments[0].text;
        assert.ok(key in catalogs.en.ui, `${file}: ${key}`);
        const required = Object.keys(argumentsOf(parse(catalogs.en.ui[key])));
        const provided = node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])
          ? node.arguments[1].properties.map(property => property.name?.getText(source).replaceAll('"', '')) : [];
        for (const argument of required) assert.ok(provided.includes(argument), `${file}: ${key} needs ${argument}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});

test("plural messages handle zero, one and many in both languages", () => {
  const es = createTranslator({ locale: "es", messages: catalogs.es, namespace: "ui" });
  const en = createTranslator({ locale: "en", messages: catalogs.en, namespace: "ui" });
  assert.equal(es("sellerCount", { count: 1 }), "1 vendedor independiente");
  assert.equal(es("sellerCount", { count: 2 }), "2 vendedores independientes");
  assert.equal(en("productCount", { count: 0 }), "0 products");
  assert.equal(en("productCount", { count: 1 }), "1 product");
  assert.equal(es("unitsInStock", { count: 2 }), "2 unidades disponibles");
});
