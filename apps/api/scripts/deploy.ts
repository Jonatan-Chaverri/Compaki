/**
 * One-shot testnet provisioning (pure @stellar/stellar-sdk — no stellar-cli
 * needed, so it works regardless of locally-installed CLI versions):
 *   1. creates + funds the demo-asset issuer account (Friendbot),
 *   2. deploys the Stellar Asset Contract (SAC) for <CODE>:<issuer>,
 *   3. builds (cargo) + uploads + deploys the marketplace Soroban contract,
 *   4. calls initialize(admin = issuer, token = SAC),
 *   5. writes every address/id to .env.local for the API.
 *
 * The demo asset is self-issued test money. Fresh deploys name it CPKUSD
 * ("Compaki demo USD", override with DEMO_ASSET_CODE) so it can't be mistaken
 * for Circle's USDC. Older deployments used the code USDC with a self-issued
 * issuer — still not Circle USDC.
 *
 * Run: npm run deploy:testnet                      (everything, new asset)
 *      npm run deploy:testnet -- --contract-only   (new contract only)
 *
 * --contract-only keeps the issuer + token from the existing env file, so
 * every existing custodial account and trustline keeps working, deploys a
 * NEW marketplace contract and rewrites only MARKETPLACE_CONTRACT_ID. Contract
 * WASM changes never reach an already-deployed contract (it has no upgrade
 * function, by design), so this is how a contract change ships. Existing
 * marketplaces must then be re-registered: npm run marketplaces:rebind.
 *
 * DEPLOY_ENV_FILE=path writes to another env file instead of .env.local.
 */

import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const HERE = path.dirname(fileURLToPath(import.meta.url)); // ESM: no __dirname
const ROOT = path.resolve(HERE, ".."); // apps/api — where .env.local lives
const CONTRACTS_DIR = path.resolve(HERE, "../../../contracts"); // repo root
const WASM_PATH = path.join(
  CONTRACTS_DIR,
  "target/wasm32v1-none/release/compaki_marketplace.wasm",
);
const ENV_LOCAL = process.env.DEPLOY_ENV_FILE
  ? path.resolve(process.env.DEPLOY_ENV_FILE)
  : path.join(ROOT, ".env.local");
const CONTRACT_ONLY = process.argv.includes("--contract-only");
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

/** Reads a value from the target env file (e.g. to preserve WALLET_ENCRYPTION_KEY so stored custodial secrets stay decryptable). */
function existingEnvValue(key: string): string | undefined {
  if (!existsSync(ENV_LOCAL)) return undefined;
  const match = readFileSync(ENV_LOCAL, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
  return match?.[1]?.replace(/^"|"$/g, "") || undefined;
}

/** Builds, uploads, deploys and initializes the marketplace contract. */
async function deployMarketplaceContract(issuer: Keypair, sacAddress: string): Promise<string> {
  console.log("Building marketplace contract (cargo → wasm)...");
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

  console.log("Uploading + deploying marketplace contract...");
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
      salt: randomBytes(32),
    }),
    issuer,
    "contract create",
  );
  if (!createResult) throw new Error("contract create returned no address");
  const contractId = Address.fromScVal(createResult).toString();
  console.log(`    contract: ${contractId}`);

  console.log("Initializing contract (admin + payment token)...");
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
  return contractId;
}

/** --contract-only: new contract, same issuer + token, one env line changed. */
async function deployContractOnly(): Promise<void> {
  console.log("── Compaki testnet deploy (contract only) ──────────────");
  const issuerSecret = existingEnvValue("DEMO_USDC_ISSUER_SECRET");
  const sacAddress = existingEnvValue("DEMO_USDC_SAC_ADDRESS");
  const previous = existingEnvValue("MARKETPLACE_CONTRACT_ID");
  if (!issuerSecret || !sacAddress) {
    throw new Error(`${ENV_LOCAL} has no DEMO_USDC_ISSUER_SECRET / DEMO_USDC_SAC_ADDRESS — run a full deploy first`);
  }
  const issuer = Keypair.fromSecret(issuerSecret);
  console.log(`    reusing issuer ${issuer.publicKey()} and token ${sacAddress}`);
  const contractId = await deployMarketplaceContract(issuer, sacAddress);

  const env = readFileSync(ENV_LOCAL, "utf8");
  const line = `MARKETPLACE_CONTRACT_ID=${contractId}`;
  const updated = /^MARKETPLACE_CONTRACT_ID=.*$/m.test(env)
    ? env.replace(
        /^MARKETPLACE_CONTRACT_ID=.*$/m,
        `# Previous contract (${new Date().toISOString()}): ${previous ?? "none"}\n${line}`,
      )
    : `${env.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_LOCAL, updated);

  console.log("────────────────────────────────────────────────────────");
  console.log(`✔ Updated MARKETPLACE_CONTRACT_ID in ${ENV_LOCAL}`);
  console.log(`✔ Contract: https://stellar.expert/explorer/testnet/contract/${contractId}`);
  console.log("Next: npm run prisma:migrate:deploy && npm run marketplaces:rebind");
}

async function main(): Promise<void> {
  if (CONTRACT_ONLY) return deployContractOnly();
  console.log("── Compaki testnet deploy ──────────────────────────────");
  const assetCode = process.env.DEMO_ASSET_CODE ?? "CPKUSD";

  // 1. Issuer account (also the contract admin + platform source account).
  console.log(`1/3 Creating demo-asset issuer account (${assetCode}, test money)...`);
  const issuer = Keypair.random();
  await friendbot(issuer.publicKey());
  await waitForAccountOnRpc(issuer.publicKey());
  console.log(`    issuer: ${issuer.publicKey()}`);

  // 2. Wrap <CODE>:<issuer> as a Stellar Asset Contract.
  console.log("2/3 Deploying Stellar Asset Contract for the demo asset...");
  const asset = new Asset(assetCode, issuer.publicKey());
  const sacAddress = asset.contractId(PASSPHRASE);
  await submitSoroban(
    Operation.createStellarAssetContract({ asset }),
    issuer,
    "SAC deploy",
  );
  console.log(`    SAC: ${sacAddress}`);

  // 3. Marketplace contract.
  console.log("3/3 Marketplace contract...");
  const contractId = await deployMarketplaceContract(issuer, sacAddress);

  // 4. Write the env file.
  const walletKey =
    existingEnvValue("WALLET_ENCRYPTION_KEY") ?? randomBytes(32).toString("hex");
  const envContent = `# Generated by \`npm run deploy:testnet\` on ${new Date().toISOString()}
# Stellar TESTNET — safe to regenerate, but doing so orphans existing DB accounts.

STELLAR_RPC_URL=${RPC_URL}
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_FRIENDBOT_URL=${FRIENDBOT}
STELLAR_NETWORK_PASSPHRASE="${PASSPHRASE}"

# Self-issued TESTNET demo asset (not Circle USDC). Variable names keep the
# historical DEMO_USDC_ prefix.
DEMO_USDC_CODE=${assetCode}
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
