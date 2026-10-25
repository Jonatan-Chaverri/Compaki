import assert from "node:assert/strict";
import test from "node:test";

import { Keypair, Networks, TransactionBuilder, WebAuth } from "@stellar/stellar-sdk";

process.env.SESSION_SECRET = "sep10-test-secret";
process.env.HOME_DOMAIN = "compaki.test";
process.env.STELLAR_NETWORK_PASSPHRASE = Networks.TESTNET;
process.env.DEMO_USDC_CODE = "CPKUSD";
process.env.DEMO_USDC_ISSUER_PUBLIC = Keypair.random().publicKey();
process.env.DEMO_USDC_SAC_ADDRESS = "CBGWV2H546XCQ22BRFMZNAOUWLZOBPHK4KOCR4OVVBIJC7OJIFEIS3QI";
process.env.MARKETPLACE_CONTRACT_ID = "CBGWV2H546XCQ22BRFMZNAOUWLZOBPHK4KOCR4OVVBIJC7OJIFEIS3QI";

const { buildChallenge, issueToken, Sep10Error, signingKeypair, verifyChallenge } = await import("./sep10");
const { createWalletChallenge, verifyWalletChallenge } = await import("./wallet-login");
const { stellarToml } = await import("../routes/stellar-toml");

/** Horizon as the verifier sees it: unknown accounts, or one account's signers. */
function horizonWith(account?: { id: string; threshold: number; signers: { key: string; weight: number }[] }) {
  globalThis.fetch = (async (url: string | URL) => {
    if (account && String(url).endsWith(`/accounts/${account.id}`)) {
      return new Response(
        JSON.stringify({
          thresholds: { med_threshold: account.threshold },
          signers: account.signers.map((s) => ({ ...s, type: "ed25519_public_key" })),
        }),
      );
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

function sign(xdr: string, ...keys: Keypair[]): string {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
  for (const key of keys) tx.sign(key);
  return tx.toXDR();
}

test("a challenge is a SEP-10 transaction for this server and home domain", () => {
  const client = Keypair.random();
  const challenge = buildChallenge(client.publicKey());
  const read = WebAuth.readChallengeTx(challenge, signingKeypair().publicKey(), Networks.TESTNET, "compaki.test", "compaki.test");
  assert.equal(read.clientAccountID, client.publicKey());
  assert.equal(read.tx.sequence, "0");
  assert.throws(() => buildChallenge(client.publicKey(), "evil.example"), Sep10Error);
});

test("the client's signature authenticates its account and yields a JWT", async () => {
  horizonWith();
  const client = Keypair.random();
  const { account, hash } = await verifyChallenge(sign(buildChallenge(client.publicKey()), client));
  assert.equal(account, client.publicKey());
  const [, payload] = issueToken(account, hash).split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  assert.equal(claims.sub, client.publicKey());
  assert.equal(claims.iss, "https://compaki.test/api/auth/sep10");
  assert.equal(claims.jti, hash);
});

test("missing, foreign or forged signatures are rejected", async () => {
  horizonWith();
  const client = Keypair.random();
  const challenge = buildChallenge(client.publicKey());
  await assert.rejects(verifyChallenge(challenge), Sep10Error);
  await assert.rejects(verifyChallenge(sign(challenge, Keypair.random())), Sep10Error);
  // A challenge some other server issued, even signed by the client.
  const forged = WebAuth.buildChallengeTx(Keypair.random(), client.publicKey(), "compaki.test", 900, Networks.TESTNET, "compaki.test");
  await assert.rejects(verifyChallenge(sign(forged, client)), Sep10Error);
});

test("existing accounts must meet their medium threshold", async () => {
  const client = Keypair.random();
  const cosigner = Keypair.random();
  horizonWith({
    id: client.publicKey(),
    threshold: 2,
    signers: [{ key: client.publicKey(), weight: 1 }, { key: cosigner.publicKey(), weight: 2 }],
  });
  const challenge = buildChallenge(client.publicKey());
  await assert.rejects(verifyChallenge(sign(challenge, client)), Sep10Error);
  assert.equal((await verifyChallenge(sign(challenge, cosigner))).account, client.publicKey());
});

test("wallet sign-in accepts each signed challenge once, for its own address", async () => {
  horizonWith();
  const client = Keypair.random();
  const signed = sign(createWalletChallenge(client.publicKey()).xdr, client);
  assert.equal(await verifyWalletChallenge(Keypair.random().publicKey(), signed), false);
  assert.equal(await verifyWalletChallenge(client.publicKey(), signed), true);
  assert.equal(await verifyWalletChallenge(client.publicKey(), signed), false);
});

test("stellar.toml publishes the signing key, auth endpoint and the demo asset", async () => {
  const res = await stellarToml.request("/stellar.toml");
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  const toml = await res.text();
  assert.match(toml, new RegExp(`SIGNING_KEY = "${signingKeypair().publicKey()}"`));
  assert.match(toml, /WEB_AUTH_ENDPOINT = "https:\/\/compaki\.test\/api\/auth\/sep10"/);
  assert.match(toml, /code = "CPKUSD"/);
  assert.match(toml, /status = "test"/);
  assert.match(toml, /NOT Circle's USDC/);
});
