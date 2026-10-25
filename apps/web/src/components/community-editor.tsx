"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { CommunityFields } from "./community-fields";
import { communityDraft, communityDraftValid, communitySubmission, type CommunityDetails } from "@/lib/community";
import type { CommunityMode } from "@/lib/rewards";

export function CommunityEditor({ slug, initial, mode }: { slug: string; initial: CommunityDetails; mode: CommunityMode }) {
  const router = useRouter();
  const [value, setValue] = useState(() => communityDraft(initial));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><p className="eyebrow">Your public community story</p><Link href={`/m/${slug}/community`} className="text-link">View community page →</Link></div>
    <form onSubmit={async event => {
      event.preventDefault();
      if (!communityDraftValid(value, mode) || busy) return;
      setBusy(true); setError(null); setMessage(null);
      try {
        const response = await fetch(`/api/marketplaces/${encodeURIComponent(slug)}/community`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(communitySubmission(value)) });
        const body = await response.json() as { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Could not save community details");
        setMessage("Community details saved. Your public page is up to date.");
        router.refresh();
      } catch (error) { setError(error instanceof Error ? error.message : "Could not save community details"); }
      finally { setBusy(false); }
    }}>
      <CommunityFields value={value} onChange={v => { setValue(v); setMessage(null); }} disabled={busy} mode={mode} />
      <p className="mt-6 rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">Updating this story changes the public explanation. It does not change payment percentages, rewards periods, the fundraising target or recipient wallets.</p>
      {message && <p role="status" className="mt-4 text-sm text-emerald-700">{message}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy || !communityDraftValid(value, mode)} className="button-primary mt-6 disabled:opacity-40">{busy ? "Saving…" : "Save community details"}</button>
    </form>
  </section>;
}
