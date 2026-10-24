/**
 * Administrator tool: sets a password for an existing account (e.g. a legacy
 * passwordless user, who can no longer be claimed by registering with the
 * same email). Prints a freshly generated password once — share it with the
 * account owner over a trusted channel.
 *
 * Run: npm run users:set-password -- someone@example.com
 */

import "./load-env";

import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/lib/passwords";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run users:set-password -- <email>");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}`);

  const password = randomBytes(12).toString("base64url");
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) },
  });
  console.log(`✔ Password set for ${user.name} <${email}>: ${password}`);
}

main()
  .catch((error) => {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
