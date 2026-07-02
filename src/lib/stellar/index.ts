// Stellar/Soroban service layer — the ONLY module allowed to talk to the chain.
// The frontend and API routes import from here; they never touch
// @stellar/stellar-sdk directly.
//
// Populated in later phases:
//   accounts.ts  — custodial keypair generation + Friendbot funding
//   asset.ts     — demo USDC issuance and trustlines
//   contract.ts  — marketplace contract calls (register, add vendor, purchase)

export {};
