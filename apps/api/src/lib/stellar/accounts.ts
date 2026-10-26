// Account helpers: Friendbot funding, demo-asset trustlines, balances and the
// one-time setup transaction a user's own wallet signs. Compaki never creates
// or stores keys for its users; createTestAccount only serves the on-chain
// proof script.

import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { stellarConfig, usdToStroops } from "./config";
import { withTimeoutRetry } from "./retry";

export interface TestAccount {
  publicKey: string;
  secret: string;
}

let horizonServer: Horizon.Server | undefined;

function getHorizon(): Horizon.Server {
  horizonServer ??= new Horizon.Server(stellarConfig.horizonUrl);
  return horizonServer;
}

function demoUsdcAsset(): Asset {
  return new Asset(stellarConfig.usdcCode, stellarConfig.usdcIssuerPublic);
}

/** Horizon expects decimal string amounts ("42.0000000"), max 7 dp. */
function usdToHorizonAmount(amountUsd: number): string {
  return (usdToStroops(amountUsd) / 10_000_000n).toString() +
    "." +
    (usdToStroops(amountUsd) % 10_000_000n).toString().padStart(7, "0");
}

export async function fundWithFriendbot(publicKey: string): Promise<void> {
  await withTimeoutRetry(`friendbot ${publicKey.slice(0, 6)}`, async () => {
    const res = await fetch(
      `${stellarConfig.friendbotUrl}?addr=${encodeURIComponent(publicKey)}`,
    );
    // 400 with "createAccountAlreadyExist" means a previous attempt landed — fine.
    if (!res.ok) {
      const body = await res.text();
      if (!body.includes("createAccountAlreadyExist")) {
        throw new Error(`Friendbot failed (${res.status}): ${body.slice(0, 300)}`);
      }
    }
  });
}

async function submitTx(
  build: (builder: TransactionBuilder) => TransactionBuilder,
  source: Keypair,
  extraSigners: Keypair[] = [],
): Promise<string> {
  return withTimeoutRetry("horizon submit", async () => {
    const horizon = getHorizon();
    const account = await horizon.loadAccount(source.publicKey());
    const tx = build(
      new TransactionBuilder(account, {
        fee: (Number(BASE_FEE) * 10).toString(),
        networkPassphrase: stellarConfig.networkPassphrase,
      }),
    )
      .setTimeout(60)
      .build();
    tx.sign(source, ...extraSigners);
    const result = await horizon.submitTransaction(tx);
    return result.hash;
  });
}

/**
 * Creates a throwaway testnet account for scripts/demo-rewards.ts: a random
 * keypair funded via Friendbot, with a trustline to the demo asset and an
 * optional starting balance minted by the issuer. Its key only lives in the
 * script's memory.
 *
 * The trustline and the mint ride in ONE transaction (issuer payment as a
 * second operation) so it costs a single Horizon round trip.
 */
export async function createTestAccount(options?: {
  startingUsd?: number;
}): Promise<TestAccount> {
  const keypair = Keypair.random();
  const startingUsd = options?.startingUsd ?? 0;
  const issuer = Keypair.fromSecret(stellarConfig.usdcIssuerSecret);
  const asset = demoUsdcAsset();

  await fundWithFriendbot(keypair.publicKey());

  await submitTx(
    (builder) => {
      builder.addOperation(Operation.changeTrust({ asset }));
      if (startingUsd > 0) {
        builder.addOperation(
          Operation.payment({
            source: issuer.publicKey(),
            destination: keypair.publicKey(),
            asset,
            amount: usdToHorizonAmount(startingUsd),
          }),
        );
      }
      return builder;
    },
    keypair,
    startingUsd > 0 ? [issuer] : [],
  );

  return { publicKey: keypair.publicKey(), secret: keypair.secret() };
}

/** Mints extra demo USDC to an existing account (top-ups for demos). */
export async function mintDemoUsd(
  destinationPublicKey: string,
  amountUsd: number,
): Promise<string> {
  const issuer = Keypair.fromSecret(stellarConfig.usdcIssuerSecret);
  return submitTx(
    (builder) =>
      builder.addOperation(
        Operation.payment({
          destination: destinationPublicKey,
          asset: demoUsdcAsset(),
          amount: usdToHorizonAmount(amountUsd),
        }),
      ),
    issuer,
  );
}

/** Demo-USDC balance of an account, as a UI-ready USD number. */
export async function getUsdBalance(publicKey: string): Promise<number> {
  return withTimeoutRetry(`balance ${publicKey.slice(0, 6)}`, async () => {
    const account = await getHorizon().loadAccount(publicKey);
    const entry = account.balances.find(
      (b) =>
        b.asset_type !== "native" &&
        "asset_code" in b &&
        b.asset_code === stellarConfig.usdcCode &&
        b.asset_issuer === stellarConfig.usdcIssuerPublic,
    );
    return entry ? Number.parseFloat(entry.balance) : 0;
  });
}

/** Demo-asset trustline state of an account ("missing" = not on-chain yet). */
export async function demoTrustlineState(
  publicKey: string,
): Promise<"missing" | "no-trustline" | "ready"> {
  return withTimeoutRetry(`trustline ${publicKey.slice(0, 6)}`, async () => {
    let account;
    try {
      account = await getHorizon().loadAccount(publicKey);
    } catch (error) {
      if (error instanceof Error && /not found|404/i.test(`${error.name} ${error.message}`)) {
        return "missing";
      }
      throw error;
    }
    const trusts = account.balances.some(
      (b) =>
        b.asset_type !== "native" &&
        "asset_code" in b &&
        b.asset_code === stellarConfig.usdcCode &&
        b.asset_issuer === stellarConfig.usdcIssuerPublic,
    );
    return trusts ? "ready" : "no-trustline";
  });
}

/**
 * Setup for a user-owned wallet (Cavos): ONE transaction holding the wallet's
 * trustline to the demo asset plus a starting demo balance minted by the
 * issuer, already signed by the issuer. Only the wallet's own signature is
 * missing — Compaki never holds that key. The account must already exist.
 */
export async function prepareTrustlineSetup(params: {
  publicKey: string;
  startingUsd: number;
}): Promise<{ xdr: string; hash: string }> {
  return withTimeoutRetry("prepare wallet setup", async () => {
    const account = await getHorizon().loadAccount(params.publicKey);
    const issuer = Keypair.fromSecret(stellarConfig.usdcIssuerSecret);
    const asset = demoUsdcAsset();
    const builder = new TransactionBuilder(account, {
      fee: (Number(BASE_FEE) * 10).toString(),
      networkPassphrase: stellarConfig.networkPassphrase,
    }).addOperation(Operation.changeTrust({ asset }));
    if (params.startingUsd > 0) {
      builder.addOperation(
        Operation.payment({
          source: issuer.publicKey(),
          destination: params.publicKey,
          asset,
          amount: usdToHorizonAmount(params.startingUsd),
        }),
      );
    }
    const tx = builder.setTimeout(180).build();
    tx.sign(issuer);
    return { xdr: tx.toXDR(), hash: tx.hash().toString("hex") };
  });
}
