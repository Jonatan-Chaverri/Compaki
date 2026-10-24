// "My rewards" — Community Rewards periods the session user is a member of,
// across marketplaces, with on-chain amounts and a claim button.


import { AppHeader, PageHeading, EmptyState } from "@/components/shell";
import { apiFetch } from "@/lib/api";

import { MemberRewards, type MemberRewardsPayload } from "./member-rewards";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const res = await apiFetch("/api/rewards/me");

  if (res.status === 401) {
    return (
      <div className="min-h-screen bg-slate-50/60">
        <AppHeader />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-xl px-6 py-20 text-center">
          <EmptyState icon="leaf" title="Good things grow together." description="If a marketplace has invited you to share in community rewards, sign in to see your share and collect available rewards." href="/login?next=/rewards" action="Sign in to see rewards" />
        </main>
      </div>
    );
  }
  const body = (await res.json()) as MemberRewardsPayload & { error?: string };

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-6 py-12">
        <PageHeading eyebrow="Your share of the good" title="Community rewards." description="Communities you belong to can set aside a share of each sale for their members. See what’s growing and collect your rewards when a period closes." />
        <div className="account-intro"><span>01 · Sales grow the fund</span><span>→</span><span>02 · The period closes</span><span>→</span><span>03 · Collect your share</span></div>
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
