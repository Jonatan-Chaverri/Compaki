/**
 * One-shot testnet provisioning (pure @stellar/stellar-sdk — no stellar-cli
 * needed, so it works regardless of locally-installed CLI versions):
 *   1. creates + funds the demo-USDC issuer account (Friendbot),
 *   2. deploys the Stellar Asset Contract (SAC) for USDC:<issuer>,
 *   3. builds (cargo) + uploads + deploys the marketplace Soroban contract,
 *   4. calls initialize(admin = issuer, token = SAC),
 *   5. writes every address/id to .env.local for the Next.js app.
 *
 * Run: npm run deploy:testnet
 */

import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

const ROOT = path.resolve(__dirname, ".."); // apps/api — where .env.local lives
const CONTRACTS_DIR = path.resolve(__dirname, "../../../contracts"); // repo root
const WASM_PATH = path.join(
  CONTRACTS_DIR,
  "target/wasm32v1-none/release/compaki_marketplace.wasm",
);
const ENV_LOCAL = path.join(ROOT, ".env.local");
const FRIENDBOT = "https://friendbot.stellar.org";
const RPC_URL = "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";

const server = new rpc.Server(RPC_URL);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function friendbot(publicKey: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT}?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) {
    const body = await res.text();
    if (!body.includes("createAccountAlreadyExist")) {
      throw new Error(`Friendbot failed (${res.status}): ${body.slice(0, 300)}`);
    }
  }
}

/** Friendbot lands on Horizon before the RPC node ingests the ledger. */
async function waitForAccountOnRpc(publicKey: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await server.getAccount(publicKey);
      return;
    } catch {
      await sleep(2_000);
    }
  }
  throw new Error(`Account ${publicKey} never appeared on Soroban RPC`);
}

/** Simulate → sign → submit → poll one Soroban operation. Retries once on timeout-ish errors. */
async function submitSoroban(
  operation: xdr.Operation,
  signer: Keypair,
  label: string,
): Promise<xdr.ScVal | undefined> {
  const attempt = async (): Promise<xdr.ScVal | undefined> => {
    const account = await server.getAccount(signer.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: (Number(BASE_FEE) * 1_000).toString(),
      networkPassphrase: PASSPHRASE,
    })
      .addOperation(operation)
      .setTimeout(120)
      .build();

    const prepared = await server.prepareTransaction(tx);
    prepared.sign(signer);
    const sent = await server.sendTransaction(prepared);
    if (sent.status === "ERROR") {
      throw new Error(`${label}: submission failed: ${JSON.stringify(sent.errorResult)}`);
    }
    for (let i = 0; i < 30; i++) {
      const result = await server.getTransaction(sent.hash);
      if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return result.returnValue;
      }
      if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`${label}: tx ${sent.hash} failed on-chain`);
      }
      await sleep(1_500);
    }
    throw new Error(`${label}: tx ${sent.hash} confirmation timeout`);
  };

  // Retry transient failures: timeouts, and "MissingValue" — the testnet RPC
  // is load-balanced, so a node may briefly lag behind a just-confirmed
  // ledger entry (e.g. simulating create right after the wasm upload).
  const RETRYABLE = ["timeout", "try_again_later", "504", "503", "missingvalue", "does not exist"];
  let lastError: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      const msg = String(error).toLowerCase();
      if (!RETRYABLE.some((p) => msg.includes(p))) throw error;
      console.warn(`    ${label}: transient failure, retrying (${i + 1}/5)...`);
      await sleep(4_000);
    }
  }
  throw lastError;
}

/** Preserve an existing WALLET_ENCRYPTION_KEY across re-deploys so stored custodial secrets stay decryptable. */
function existingEnvValue(key: string): string | undefined {
  if (!existsSync(ENV_LOCAL)) return undefined;
  const match = readFileSync(ENV_LOCAL, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
  return match?.[1]?.replace(/^"|"$/g, "") || undefined;
}

async function main(): Promise<void> {
  console.log("── Compaki testnet deploy ──────────────────────────────");

  // 1. Issuer account (also the contract admin + platform source account).
  console.log("1/5 Creating demo-USDC issuer account...");
  const issuer = Keypair.random();
  await friendbot(issuer.publicKey());
  await waitForAccountOnRpc(issuer.publicKey());
  console.log(`    issuer: ${issuer.publicKey()}`);

  // 2. Wrap USDC:<issuer> as a Stellar Asset Contract.
  console.log("2/5 Deploying Stellar Asset Contract for demo USDC...");
  const asset = new Asset("USDC", issuer.publicKey());
  const sacAddress = asset.contractId(PASSPHRASE);
  await submitSoroban(
    Operation.createStellarAssetContract({ asset }),
    issuer,
    "SAC deploy",
  );
  console.log(`    SAC: ${sacAddress}`);

  // 3. Build + upload + deploy the marketplace contract.
  console.log("3/5 Building marketplace contract (cargo → wasm)...");
  // wasm32v1-none emits pure WASM-1.0 (MVP) bytecode. The default
  // wasm32-unknown-unknown target on rustc ≥1.82 emits reference-types,
  // which Soroban's VM rejects at upload. Requires: rustup target add wasm32v1-none
  execSync("cargo build --target wasm32v1-none --release", {
    cwd: CONTRACTS_DIR,
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (!existsSync(WASM_PATH)) {
    throw new Error(`wasm not found at ${WASM_PATH}`);
  }

  console.log("4/5 Uploading + deploying marketplace contract...");
  const wasm = readFileSync(WASM_PATH);
  const uploadResult = await submitSoroban(
    Operation.uploadContractWasm({ wasm }),
    issuer,
    "wasm upload",
  );
  if (!uploadResult) throw new Error("wasm upload returned no hash");
  const wasmHash = scValToNative(uploadResult) as Buffer;

  const createResult = await submitSoroban(
    Operation.createCustomContract({
      address: new Address(issuer.publicKey()),
      wasmHash,
    }),
    issuer,
    "contract create",
  );
  if (!createResult) throw new Error("contract create returned no address");
  const contractId = Address.fromScVal(createResult).toString();
  console.log(`    contract: ${contractId}`);

  // 4. initialize(admin, token).
  console.log("5/5 Initializing contract (admin + payment token)...");
  const contract = new Contract(contractId);
  await submitSoroban(
    contract.call(
      "initialize",
      nativeToScVal(issuer.publicKey(), { type: "address" }),
      nativeToScVal(sacAddress, { type: "address" }),
    ),
    issuer,
    "initialize",
  );

  // 5. Write .env.local.
  const walletKey =
    existingEnvValue("WALLET_ENCRYPTION_KEY") ?? randomBytes(32).toString("hex");
  const envContent = `# Generated by \`npm run deploy:testnet\` on ${new Date().toISOString()}
# Stellar TESTNET — safe to regenerate, but doing so orphans existing DB accounts.

STELLAR_RPC_URL=${RPC_URL}
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_FRIENDBOT_URL=${FRIENDBOT}
STELLAR_NETWORK_PASSPHRASE="${PASSPHRASE}"

DEMO_USDC_CODE=USDC
DEMO_USDC_ISSUER_PUBLIC=${issuer.publicKey()}
DEMO_USDC_ISSUER_SECRET=${issuer.secret()}
DEMO_USDC_SAC_ADDRESS=${sacAddress}

MARKETPLACE_CONTRACT_ID=${contractId}

WALLET_ENCRYPTION_KEY=${walletKey}
`;
  writeFileSync(ENV_LOCAL, envContent);

  console.log("────────────────────────────────────────────────────────");
  console.log(`✔ Wrote ${ENV_LOCAL}`);
  console.log(`✔ Contract: https://stellar.expert/explorer/testnet/contract/${contractId}`);
  console.log("Next: npm run demo:purchase");
}

main().catch((error) => {
  console.error("Deploy failed:", error);
  process.exit(1);
});
