// "My rewards" — Community Rewards periods the session user is a member of,
// across marketplaces, with on-chain amounts and a claim button.

import Link from "next/link";

import { AppHeader } from "@/components/shell";
import { apiFetch } from "@/lib/api";

import { MemberRewards, type MemberRewardsPayload } from "./member-rewards";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const res = await apiFetch("/api/rewards/me");

  if (res.status === 401) {
    return (
      <div className="min-h-screen bg-slate-50/60">
        <AppHeader />
        <main className="mx-auto w-full max-w-xl px-6 py-20 text-center">
          <p className="text-3xl">🔐</p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
            Sign in to see your community rewards
          </h1>
          <Link
            href="/login?next=/rewards"
            className="mt-6 inline-block rounded-full bg-navy-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-navy-700"
          >
            Sign in
          </Link>
        </main>
      </div>
    );
  }
  const body = (await res.json()) as MemberRewardsPayload & { error?: string };

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My community rewards</h1>
        <p className="mt-1 text-sm text-slate-500">
          Marketplaces you belong to set aside part of every sale in an on-chain treasury. When a
          period closes, your share is fixed by the contract and you can claim it.
        </p>
        {res.ok ? (
          <MemberRewards initial={body} />
        ) : (
          <p className="mt-8 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {body.error ?? `Could not load rewards (${res.status})`}
          </p>
        )}
      </main>
    </div>
  );
}
