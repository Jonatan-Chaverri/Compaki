import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
const code = ts.transpileModule(readFileSync(new URL("../src/lib/storefront-filters.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports });
const { filterStorefrontProducts, parsePriceRange, storefrontVendors } = exports;
const products = [
  { id: "honey", name: "Miel orgánica", priceUsd: 10, vendorId: "a", vendorName: "Carmen", shortDescription: "Flor de café" },
  { id: "coffee", name: "Café molido", priceUsd: 20, vendorId: "b", vendorName: "Carmen", shortDescription: "De montaña" },
  { id: "honey2", name: "Miel de montaña", priceUsd: 30, vendorId: "c", vendorName: "Luis", shortDescription: "Frasco grande" },
  { id: "sample", name: "Muestra", priceUsd: 0, vendorId: "a", vendorName: "Carmen", shortDescription: "Gratis" },
];
const matches = (filters = {}) => Array.from(filterStorefrontProducts(products, { query: "", minPrice: "", maxPrice: "", vendorIds: [], ...filters }), item => item.id);

test("search matches product names without accents or case; all words must match", () => {
  assert.deepEqual(matches({ query: "  ORGANICA miel " }), ["honey"]);
  assert.deepEqual(matches({ query: "cafe" }), ["coffee"]);
  assert.deepEqual(matches({ query: "Carmen" }), []);
  assert.deepEqual(matches({ query: "frasco" }), []);
});

test("price limits are inclusive, optional and allow zero-priced products", () => {
  assert.deepEqual(matches({ minPrice: "10", maxPrice: "20" }), ["honey", "coffee"]);
  assert.deepEqual(matches({ minPrice: "20" }), ["coffee", "honey2"]);
  assert.deepEqual(matches({ maxPrice: "10" }), ["honey", "sample"]);
  assert.deepEqual(matches({ minPrice: "0", maxPrice: "0" }), ["sample"]);
});

test("seller filtering uses identities, supports multiple choices and combines with name and price", () => {
  assert.deepEqual(matches({ vendorIds: ["b"] }), ["coffee"]);
  assert.deepEqual(matches({ vendorIds: ["a", "c"], query: "miel", minPrice: "15" }), ["honey2"]);
  assert.deepEqual(matches({ vendorIds: ["a", "b"] }), ["honey", "coffee", "sample"]);
  assert.deepEqual(matches(), ["honey", "coffee", "honey2", "sample"]);
});

test("reversed, negative and invalid ranges are flagged instead of silently ignored", () => {
  assert.equal(parsePriceRange("30", "10").error, "reversed");
  for (const [minPrice, maxPrice] of [["-1", ""], ["", "Infinity"], ["abc", ""]]) {
    assert.equal(parsePriceRange(minPrice, maxPrice).error, "invalid");
    assert.deepEqual(matches({ minPrice, maxPrice }), []);
  }
  assert.equal(parsePriceRange("10", "10").error, null);
  assert.equal(parsePriceRange("", "").error, null);
});

test("the seller list counts products independently and keeps same-name sellers separate", () => {
  const vendors = Array.from(storefrontVendors(products, "es"), vendor => [vendor.id, vendor.name, vendor.count]);
  assert.deepEqual(vendors, [["a", "Carmen", 2], ["b", "Carmen", 1], ["c", "Luis", 1]]);
  assert.equal(products.length, 4);
});
