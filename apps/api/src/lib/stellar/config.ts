// Server-side Stellar configuration, populated by `npm run deploy:testnet`
// (which writes .env.local). Never import this from client components.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing env var ${name}. Run \`npm run deploy:testnet\` to provision testnet assets and write .env.local.`,
    );
  }
  return value;
}

export const stellarConfig = {
  get rpcUrl(): string {
    return process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
  },
  get horizonUrl(): string {
    return process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
  },
  get friendbotUrl(): string {
    return process.env.STELLAR_FRIENDBOT_URL ?? "https://friendbot.stellar.org";
  },
  get networkPassphrase(): string {
    return process.env.STELLAR_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
  },
  get usdcCode(): string {
    return process.env.DEMO_USDC_CODE ?? "USDC";
  },
  get usdcIssuerPublic(): string {
    return requireEnv("DEMO_USDC_ISSUER_PUBLIC");
  },
  get usdcIssuerSecret(): string {
    return requireEnv("DEMO_USDC_ISSUER_SECRET");
  },
  get usdcSacAddress(): string {
    return requireEnv("DEMO_USDC_SAC_ADDRESS");
  },
  get marketplaceContractId(): string {
    return requireEnv("MARKETPLACE_CONTRACT_ID");
  },
  get walletEncryptionKey(): string {
    return requireEnv("WALLET_ENCRYPTION_KEY");
  },
};

/** UI amounts are USD floats; on-chain amounts are i128 with 7 decimals. */
export const USDC_DECIMALS = 7;

export function usdToStroops(amountUsd: number): bigint {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error(`Invalid USD amount: ${amountUsd}`);
  }
  return BigInt(Math.round(amountUsd * 10 ** USDC_DECIMALS));
}

export function stroopsToUsd(stroops: bigint): number {
  return Number(stroops) / 10 ** USDC_DECIMALS;
}

export function stellarExpertTxUrl(txHash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}

export function stellarExpertContractUrl(contractId: string): string {
  return `https://stellar.expert/explorer/testnet/contract/${contractId}`;
}
