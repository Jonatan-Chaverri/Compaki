/**
 * One-shot testnet provisioning (pure @stellar/stellar-sdk — no stellar-cli
 * needed, so it works regardless of locally-installed CLI versions):
 *   1. creates + funds the demo-asset issuer account (Friendbot),
 *   2. deploys the Stellar Asset Contract (SAC) for <CODE>:<issuer>,
 *   3. builds (cargo) + uploads + deploys the marketplace Soroban contract,
 *   4. creates the platform fee account (receives Compaki's fixed 2% of every
 *      sale; it needs a trustline to the demo asset),
 *   5. calls initialize(admin = issuer, token = SAC, platform = that account),
 *   6. writes every address/id to .env.local for the API.
 *
 * The demo asset is self-issued test money. Fresh deploys name it CPKUSD
 * ("Compaki demo USD", override with DEMO_ASSET_CODE) so it can't be mistaken
 * for Circle's USDC. Older deployments used the code USDC with a self-issued
 * issuer — still not Circle USDC.
 *
 * Run: npm run deploy:testnet                      (everything, new asset)
 *      npm run deploy:testnet -- --upgrade         (new code, same contract)
 *      npm run deploy:testnet -- --contract-only   (new contract only)
 *
 * --upgrade builds and uploads the current contract code and calls the
 * deployed contract's `upgrade` with the admin key (the issuer in the env
 * file): same address, all marketplaces, periods and funds kept, nothing to
 * rebind. This is how contract changes ship. The new code must read the
 * stored data as the old code wrote it.
 *
 * --contract-only keeps the issuer + token from the existing env file, so
 * every existing custodial account and trustline keeps working, deploys a
 * NEW marketplace contract and rewrites only MARKETPLACE_CONTRACT_ID. Only
 * needed for a contract without `upgrade` (or an incompatible storage
 * change); existing marketplaces must then be re-registered:
 * npm run marketplaces:rebind.
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
  SorobanDataBuilder,
  Transaction,
  TransactionBuilder,
  type FeeBumpTransaction,
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
const UPGRADE = process.argv.includes("--upgrade");
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
const UINT32_MAX = 4_294_967_295;

/**
 * Simulates, assembles and signs a Soroban transaction. A transaction's own
 * fee is a uint32 (max ~429 XLM), but uploading new contract code can cost
 * more than that on testnet. In that case the signed transaction is wrapped
 * in a fee bump, whose fee is an int64; the signer pays for both. (The first
 * call into newly uploaded code, like initialize, can be just as expensive.)
 */
async function prepareSigned(
  tx: Transaction,
  signer: Keypair,
  label: string,
): Promise<Transaction | FeeBumpTransaction> {
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`${label}: simulation failed: ${sim.error}`);
  if (BigInt(tx.fee) + BigInt(sim.minResourceFee) <= UINT32_MAX) {
    const prepared = rpc.assembleTransaction(tx, sim).build();
    prepared.sign(signer);
    return prepared;
  }

  // TransactionBuilder refuses a resource fee above uint32: assemble it
  // (auth entries included) with a zero resource fee, then put the real
  // simulated Soroban data back on the envelope.
  const sorobanData = sim.transactionData.build();
  const assembled = rpc
    .assembleTransaction(tx, sim)
    .setSorobanData(new SorobanDataBuilder(sorobanData).setResourceFee(0).build())
    .build();
  const envelope = assembled.toEnvelope();
  envelope.v1().tx().ext(new xdr.TransactionExt(1, sorobanData));
  const inner = new Transaction(envelope, PASSPHRASE);
  inner.sign(signer);
  console.log(`    ${label}: resource fee ${(Number(sim.minResourceFee) / 1e7).toFixed(2)} XLM is above the per-tx cap, paying via fee bump`);
  const bump = TransactionBuilder.buildFeeBumpTransaction(signer, BASE_FEE, inner, PASSPHRASE);
  bump.sign(signer);
  return bump;
}

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

    const prepared = await prepareSigned(tx, signer, label);
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

/** Submits a classic (non-Soroban) transaction through RPC and waits for it. */
async function submitClassic(build: (builder: TransactionBuilder) => TransactionBuilder, signer: Keypair, label: string) {
  const account = await server.getAccount(signer.publicKey());
  const tx = build(
    new TransactionBuilder(account, { fee: (Number(BASE_FEE) * 10).toString(), networkPassphrase: PASSPHRASE }),
  )
    .setTimeout(120)
    .build();
  tx.sign(signer);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") throw new Error(`${label}: submission failed: ${JSON.stringify(sent.errorResult)}`);
  for (let i = 0; i < 30; i++) {
    const result = await server.getTransaction(sent.hash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) return;
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) throw new Error(`${label}: tx ${sent.hash} failed`);
    await sleep(1_500);
  }
  throw new Error(`${label}: tx ${sent.hash} confirmation timeout`);
}

/**
 * The account that receives Compaki's 2% platform fee: funded by Friendbot
 * and trusting the demo asset (an account can't receive a token it doesn't
 * trust, and the contract's purchase would fail).
 */
async function createPlatformAccount(assetCode: string, issuerPublic: string): Promise<Keypair> {
  const platform = Keypair.random();
  await friendbot(platform.publicKey());
  await waitForAccountOnRpc(platform.publicKey());
  await submitClassic(
    (b) => b.addOperation(Operation.changeTrust({ asset: new Asset(assetCode, issuerPublic) })),
    platform,
    "platform trustline",
  );
  console.log(`    platform fee account: ${platform.publicKey()}`);
  return platform;
}

/** Builds, uploads, deploys and initializes the marketplace contract. */
/**
 * Extends the code (and instance, once deployed) to ~30 days right away.
 * The contract never extends its own code in user calls (its rent would land
 * on a buyer), so it is paid here when the code ships; afterwards the API
 * scheduler keeps it alive.
 */
async function extendCodeTtl(wasmHash: Buffer, contractId?: string): Promise<void> {
  const keys = [xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: wasmHash }))];
  if (contractId) {
    keys.push(
      xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
          contract: new Address(contractId).toScAddress(),
          key: xdr.ScVal.scvLedgerKeyContractInstance(),
          durability: xdr.ContractDataDurability.persistent(),
        }),
      ),
    );
  }
  // No authorization is needed, so a fresh Friendbot account pays the rent.
  const signer = Keypair.random();
  await friendbot(signer.publicKey());
  await waitForAccountOnRpc(signer.publicKey());
  const account = await server.getAccount(signer.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Operation.extendFootprintTtl({ extendTo: 30 * 17_280 }))
    .setSorobanData(new SorobanDataBuilder().setReadOnly(keys).build())
    .setTimeout(120)
    .build();
  const prepared = await prepareSigned(tx, signer, "code TTL extension");
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") throw new Error(`code TTL extension: ${JSON.stringify(sent.errorResult)}`);
  for (let i = 0; i < 30; i++) {
    const result = await server.getTransaction(sent.hash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      console.log("    code kept alive for 30 days");
      return;
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) throw new Error(`code TTL extension ${sent.hash} failed`);
    await sleep(1_500);
  }
  throw new Error(`code TTL extension ${sent.hash} confirmation timeout`);
}

/** Builds the contract and uploads its wasm; returns the code hash. */
async function buildAndUploadWasm(signer: Keypair): Promise<Buffer> {
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

  console.log("Uploading the contract code...");
  const wasm = readFileSync(WASM_PATH);
  const uploadResult = await submitSoroban(
    Operation.uploadContractWasm({ wasm }),
    signer,
    "wasm upload",
  );
  if (!uploadResult) throw new Error("wasm upload returned no hash");
  return scValToNative(uploadResult) as Buffer;
}

async function deployMarketplaceContract(issuer: Keypair, sacAddress: string, platformPublic: string): Promise<string> {
  const wasmHash = await buildAndUploadWasm(issuer);
  console.log("Deploying the marketplace contract...");

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
      nativeToScVal(platformPublic, { type: "address" }),
    ),
    issuer,
    "initialize",
  );
  await extendCodeTtl(wasmHash, contractId);
  return contractId;
}

/** --upgrade: new code for the deployed contract, same address and data. */
async function upgradeContract(): Promise<void> {
  console.log("── Compaki testnet contract upgrade ─────────────────────");
  const adminSecret = existingEnvValue("DEMO_USDC_ISSUER_SECRET");
  const contractId = existingEnvValue("MARKETPLACE_CONTRACT_ID");
  if (!adminSecret || !contractId) {
    throw new Error(`${ENV_LOCAL} has no DEMO_USDC_ISSUER_SECRET / MARKETPLACE_CONTRACT_ID`);
  }
  const admin = Keypair.fromSecret(adminSecret);
  console.log(`    contract ${contractId}, admin ${admin.publicKey()}`);
  const wasmHash = await buildAndUploadWasm(admin);
  console.log("Calling upgrade (admin-signed)...");
  const contract = new Contract(contractId);
  await submitSoroban(contract.call("upgrade", nativeToScVal(wasmHash, { type: "bytes" })), admin, "upgrade");
  await extendCodeTtl(wasmHash, contractId);
  const version = await submitSoroban(contract.call("version"), admin, "version");
  console.log("────────────────────────────────────────────────────────");
  console.log(`✔ Upgraded in place to code ${wasmHash.toString("hex").slice(0, 16)}… (version ${version ? scValToNative(version) : "?"})`);
  console.log(`✔ Contract: https://stellar.expert/explorer/testnet/contract/${contractId}`);
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
  // Reuse the platform fee account if this env already has one.
  let platformPublic = existingEnvValue("PLATFORM_FEE_PUBLIC");
  let newPlatform: Keypair | null = null;
  if (!platformPublic) {
    newPlatform = await createPlatformAccount(existingEnvValue("DEMO_USDC_CODE") ?? "USDC", issuer.publicKey());
    platformPublic = newPlatform.publicKey();
  }
  const contractId = await deployMarketplaceContract(issuer, sacAddress, platformPublic);

  let env = readFileSync(ENV_LOCAL, "utf8");
  const line = `MARKETPLACE_CONTRACT_ID=${contractId}`;
  env = /^MARKETPLACE_CONTRACT_ID=.*$/m.test(env)
    ? env.replace(
        /^MARKETPLACE_CONTRACT_ID=.*$/m,
        `# Previous contract (${new Date().toISOString()}): ${previous ?? "none"}\n${line}`,
      )
    : `${env.trimEnd()}\n${line}\n`;
  if (newPlatform) {
    env = `${env.trimEnd()}\n\n# Receives Compaki's fixed 2% platform fee.\nPLATFORM_FEE_PUBLIC=${newPlatform.publicKey()}\nPLATFORM_FEE_SECRET=${newPlatform.secret()}\n`;
  }
  writeFileSync(ENV_LOCAL, env);

  console.log("────────────────────────────────────────────────────────");
  console.log(`✔ Updated MARKETPLACE_CONTRACT_ID in ${ENV_LOCAL}`);
  console.log(`✔ Contract: https://stellar.expert/explorer/testnet/contract/${contractId}`);
  console.log("Next: npm run prisma:migrate:deploy && npm run marketplaces:rebind");
}

async function main(): Promise<void> {
  if (UPGRADE) return upgradeContract();
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

  // 3. Platform fee account + marketplace contract.
  console.log("3/3 Platform fee account + marketplace contract...");
  const platform = await createPlatformAccount(assetCode, issuer.publicKey());
  const contractId = await deployMarketplaceContract(issuer, sacAddress, platform.publicKey());

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

# Receives Compaki's fixed 2% platform fee.
PLATFORM_FEE_PUBLIC=${platform.publicKey()}
PLATFORM_FEE_SECRET=${platform.secret()}

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
