// POST /api/marketplaces — the launch orchestrator.
//
// Streams progress as Server-Sent Events while it: provisions custodial
// payment accounts (operator + community fund), registers the marketplace
// on-chain (create_marketplace), and writes the DB records. Designed to be
// retried: every step reuses whatever a previous attempt already created
// (operator by email, marketplace + fund by slug, on-chain id if present).

import { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { isValidSlug } from "@/lib/slug";
import { sessionCookieHeader } from "@/lib/session";
import {
  createCustodialAccount,
  createMarketplace,
  decryptSecret,
  stellarExpertTxUrl,
} from "@/lib/stellar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["Coffee & agriculture", "Crafts", "Services", "Other"] as const;

interface LaunchInput {
  name: string;
  slug: string;
  description: string;
  category: (typeof CATEGORIES)[number];
  vendorBps: number;
  operatorBps: number;
  communityBps: number;
  regenerativeEnabled: boolean;
  operatorName: string;
  operatorEmail: string;
}

function parseInput(body: unknown): LaunchInput | string {
  if (typeof body !== "object" || body === null) return "Invalid payload";
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (name.length < 2 || name.length > 60) return "Marketplace name must be 2–60 characters";

  const slug = typeof b.slug === "string" ? b.slug.trim() : "";
  if (!isValidSlug(slug)) return "Invalid URL slug";

  const description = typeof b.description === "string" ? b.description.trim().slice(0, 200) : "";

  const category = CATEGORIES.includes(b.category as (typeof CATEGORIES)[number])
    ? (b.category as (typeof CATEGORIES)[number])
    : "Other";

  const vendorBps = Number(b.vendorBps);
  const operatorBps = Number(b.operatorBps);
  const communityBps = Number(b.communityBps);
  if (
    ![vendorBps, operatorBps, communityBps].every(
      (v) => Number.isInteger(v) && v >= 0 && v <= 10_000,
    ) ||
    vendorBps + operatorBps + communityBps !== 10_000
  ) {
    return "Revenue split must sum to 100%";
  }

  const operatorName = typeof b.operatorName === "string" ? b.operatorName.trim() : "";
  if (operatorName.length < 2) return "Please tell us your name";

  const operatorEmail =
    typeof b.operatorEmail === "string" ? b.operatorEmail.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(operatorEmail)) return "Invalid email address";

  return {
    name,
    slug,
    description,
    category,
    vendorBps,
    operatorBps,
    communityBps,
    regenerativeEnabled: Boolean(b.regenerativeEnabled) || communityBps > 0,
    operatorName,
    operatorEmail,
  };
}

type LaunchStep = "accounts" | "deploy" | "store";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const input = parseInput(body);
  if (typeof input === "string") {
    return Response.json({ error: input }, { status: 400 });
  }

  // If the slug belongs to someone else's finished marketplace, fail fast.
  const existing = await prisma.marketplace.findUnique({
    where: { slug: input.slug },
    include: { operator: true },
  });
  if (existing && existing.operator.email !== input.operatorEmail) {
    return Response.json({ error: "That URL is already taken" }, { status: 409 });
  }

  // Operator user exists before the stream starts so we can set the session
  // cookie on the response headers.
  const operator = await prisma.user.upsert({
    where: { email: input.operatorEmail },
    update: { name: input.operatorName, role: "OPERATOR" },
    create: {
      email: input.operatorEmail,
      name: input.operatorName,
      role: "OPERATOR",
    },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const stepStart = (step: LaunchStep) => emit({ type: "step", step, status: "start" });
      const stepDone = (step: LaunchStep) => emit({ type: "step", step, status: "done" });

      try {
        // ── 1. Payment accounts ────────────────────────────────────────
        stepStart("accounts");

        let operatorUser = operator;
        if (!operatorUser.stellarPublicKey || !operatorUser.stellarSecretEncrypted) {
          const account = await createCustodialAccount();
          operatorUser = await prisma.user.update({
            where: { id: operator.id },
            data: {
              stellarPublicKey: account.publicKey,
              stellarSecretEncrypted: account.secretEncrypted,
            },
          });
        }

        // Marketplace row early (contract id null) so retries can resume.
        let marketplace = await prisma.marketplace.upsert({
          where: { slug: input.slug },
          update: {
            name: input.name,
            description: input.description,
            category: input.category,
            splitVendorBps: input.vendorBps,
            splitOperatorBps: input.operatorBps,
            splitCommunityBps: input.communityBps,
            regenerativeEnabled: input.regenerativeEnabled,
          },
          create: {
            name: input.name,
            slug: input.slug,
            description: input.description,
            category: input.category,
            splitVendorBps: input.vendorBps,
            splitOperatorBps: input.operatorBps,
            splitCommunityBps: input.communityBps,
            regenerativeEnabled: input.regenerativeEnabled,
            operatorId: operatorUser.id,
          },
          include: { communityFund: true },
        });

        let fundUser = marketplace.communityFund;
        if (!fundUser?.stellarPublicKey) {
          const account = await createCustodialAccount();
          fundUser = fundUser
            ? await prisma.user.update({
                where: { id: fundUser.id },
                data: {
                  stellarPublicKey: account.publicKey,
                  stellarSecretEncrypted: account.secretEncrypted,
                },
              })
            : await prisma.user.create({
                data: {
                  name: `${input.name} Community Fund`,
                  role: "COMMUNITY",
                  stellarPublicKey: account.publicKey,
                  stellarSecretEncrypted: account.secretEncrypted,
                },
              });
          marketplace = await prisma.marketplace.update({
            where: { id: marketplace.id },
            data: { communityFundId: fundUser.id },
            include: { communityFund: true },
          });
        }
        stepDone("accounts");

        // ── 2. On-chain registration ───────────────────────────────────
        stepStart("deploy");
        let contractMarketplaceId = marketplace.contractMarketplaceId;
        let createTxHash = marketplace.createTxHash;
        if (contractMarketplaceId === null) {
          if (!operatorUser.stellarSecretEncrypted || !fundUser.stellarPublicKey) {
            throw new Error("Payment accounts missing after provisioning");
          }
          const result = await createMarketplace({
            operatorSecret: decryptSecret(operatorUser.stellarSecretEncrypted),
            communityFundPublicKey: fundUser.stellarPublicKey,
            vendorBps: input.vendorBps,
            operatorBps: input.operatorBps,
            communityBps: input.communityBps,
          });
          contractMarketplaceId = result.marketplaceId.toString();
          createTxHash = result.txHash;
        }
        stepDone("deploy");

        // ── 3. Store records ───────────────────────────────────────────
        stepStart("store");
        marketplace = await prisma.marketplace.update({
          where: { id: marketplace.id },
          data: { contractMarketplaceId, createTxHash },
          include: { communityFund: true },
        });
        stepDone("store");

        emit({
          type: "complete",
          marketplace: {
            id: marketplace.id,
            name: marketplace.name,
            slug: marketplace.slug,
            url: `compaki.app/m/${marketplace.slug}`,
            path: `/m/${marketplace.slug}`,
            dashboardPath: `/dashboard/${marketplace.slug}`,
            verifyUrl: createTxHash ? stellarExpertTxUrl(createTxHash) : null,
          },
        });
      } catch (error) {
        console.error("[launch] failed:", error);
        emit({
          type: "error",
          message:
            "Something went wrong while setting up your marketplace. Nothing is lost — you can retry.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Set-Cookie": sessionCookieHeader(operator.id),
    },
  });
}
