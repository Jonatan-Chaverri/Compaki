/**
 * Checks that the API's generated contract client (src/lib/stellar/generated/
 * marketplace.ts) matches the compiled contract: same spec entries as the
 * wasm. Fails when the contract changed and `npm run contract:client` wasn't
 * run, so the API never encodes calls for an outdated interface. Used by CI.
 *
 * Run: cargo build --target wasm32v1-none --release   (repo root)
 *      npm run contract:client:check [-- path/to/compaki_marketplace.wasm]
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { contract } from "@stellar/stellar-sdk";

import { Client } from "../src/lib/stellar/generated/marketplace";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = process.argv[2] ?? path.resolve(HERE, "../../../target/wasm32v1-none/release/compaki_marketplace.wasm");

const fromWasm = contract.Spec.fromWasm(readFileSync(wasmPath)).entries.map((e) => e.toXDR("base64"));
const generated = new Client({
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
}).spec.entries.map((e) => e.toXDR("base64"));

const missing = fromWasm.filter((entry) => !generated.includes(entry)).length;
const extra = generated.filter((entry) => !fromWasm.includes(entry)).length;
if (missing || extra) {
  console.error(
    `The generated contract client is out of date (${missing} spec entries missing, ${extra} extra). ` +
      "Run `npm run contract:client` in apps/api and commit the result.",
  );
  process.exit(1);
}
console.log(`✔ Generated contract client matches the contract (${fromWasm.length} spec entries).`);
