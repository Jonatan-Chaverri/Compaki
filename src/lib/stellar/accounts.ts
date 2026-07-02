// Custodial account provisioning. Every Compaki user (operator, vendor,
// buyer, community fund) gets a server-held Stellar keypair: funded via
// Friendbot, trustline to demo USDC, and optionally some demo USDC minted
// from the issuer so buyers have money to spend.

import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { stellarConfig, usdToStroops } from "./config";
import { encryptSecret } from "./crypto";
import { withTimeoutRetry } from "./retry";

export interface CustodialAccount {
  publicKey: string;
  /** AES-encrypted secret — safe to store in the DB. */
  secretEncrypted: string;
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

async function fundWithFriendbot(publicKey: string): Promise<void> {
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
 * Creates a fully-provisioned custodial account:
 *  1. random keypair, funded via Friendbot,
 *  2. trustline to demo USDC,
 *  3. optional starting demo-USDC balance minted from the issuer,
 *  4. secret encrypted for DB storage.
 *
 * The trustline and the mint ride in ONE transaction (issuer payment as a
 * second operation) so provisioning costs a single Horizon round trip.
 */
export async function createCustodialAccount(options?: {
  startingUsd?: number;
}): Promise<CustodialAccount> {
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

  return {
    publicKey: keypair.publicKey(),
    secretEncrypted: encryptSecret(keypair.secret()),
  };
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
