// Custodial-secret encryption. AES-256-GCM with a key from env — fine for a
// demo; a production deployment would use a KMS.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { stellarConfig } from "./config";

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const hex = stellarConfig.walletEncryptionKey;
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error("WALLET_ENCRYPTION_KEY must be 32 bytes of hex (64 chars)");
  }
  return buf;
}

/** Returns "iv:authTag:ciphertext" (hex). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Malformed encrypted secret");
  }
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}
