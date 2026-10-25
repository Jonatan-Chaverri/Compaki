"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { CommunityFields } from "@/components/community-fields";
import { emptyCommunityDraft, communityDraftValid, communitySubmission } from "@/lib/community";
import { AppHeader } from "@/components/shell";
import { MarketArt } from "@/components/market-art";
import { slugify } from "@/lib/slug";

// ─── Types ───────────────────────────────────────────────────────────────

const CATEGORIES = ["Coffee & agriculture", "Crafts", "Services", "Other"] as const;
type Category = (typeof CATEGORIES)[number];

/** Compaki's fixed platform fee on every sale (set in the contract). */
const PLATFORM_PERCENT = 2;
/** What sellers + marketplace + community share: everything but the fee. */
const SHARE_PERCENT = 100 - PLATFORM_PERCENT;

interface Splits {
  vendor: number; // whole percents, always summing to 100
  operator: number;
  community: number;
}

type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

type LaunchStepId = "accounts" | "deploy" | "store";
type LaunchStepState = "pending" | "active" | "done";

interface LaunchResult {
  name: string;
  url: string;
  path: string;
  dashboardPath: string;
  verifyUrl: string | null;
}

const LAUNCH_STEPS: { id: LaunchStepId; label: string }[] = [
  { id: "accounts", label: "Creating your payment accounts..." },
  { id: "deploy", label: "Preparing your marketplace..." },
  { id: "store", label: "Setting up your store..." },
];

const WIZARD_STEPS = ["Your community", "Share the good", "Open your doors"];

// ─── Wizard ──────────────────────────────────────────────────────────────
//
// Rendered only for signed-in users (the server page gates on the session);
// the session user becomes the marketplace operator.

export function OnboardingWizard({ operatorName }: { operatorName: string }) {
  const [step, setStep] = useState(0);

  // Step 1 — slug is derived from the name until the user edits it directly.
  const [name, setName] = useState("");
  const [customSlug, setCustomSlug] = useState<string | null>(null);
  const slug = customSlug ?? slugify(name);
  const [slugCheck, setSlugCheck] = useState<{ slug: string; status: SlugStatus }>({
    slug: "",
    status: "idle",
  });
  const slugStatus: SlugStatus =
    slug === "" ? "idle" : slugCheck.slug === slug ? slugCheck.status : "checking";
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("Coffee & agriculture");

  // Step 2
  const [splits, setSplits] = useState<Splits>({ vendor: 93, operator: 5, community: 0 });
  const [regenerative, setRegenerative] = useState(false);
  const [rewards, setRewards] = useState(false);
  const [community, setCommunity] = useState(emptyCommunityDraft);

  // Step 3 (launch)
  const [launchStates, setLaunchStates] = useState<Record<LaunchStepId, LaunchStepState>>({
    accounts: "pending",
    deploy: "pending",
    store: "pending",
  });
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const launchInFlight = useRef(false);

  // ── Slug: debounced live uniqueness check ──
  useEffect(() => {
    if (!slug) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/marketplaces/check-slug?slug=${encodeURIComponent(slug)}`);
        const data = (await res.json()) as { available: boolean; reason: string | null };
        setSlugCheck({
          slug,
          status: data.available ? "available" : data.reason === "invalid" ? "invalid" : "taken",
        });
      } catch {
        setSlugCheck({ slug, status: "available" }); // network hiccup — don't block the user
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [slug]);

  // ── Split sliders: moving one re-balances so the total stays 100 ──
  const setSplit = useCallback((key: keyof Splits, raw: number) => {
    setSplits((prev) => {
      const value = Math.max(0, Math.min(100, Math.round(raw)));
      const next = { ...prev };
      if (key === "vendor") {
        next.vendor = Math.min(value, SHARE_PERCENT - prev.community);
        next.operator = SHARE_PERCENT - next.vendor - prev.community;
      } else if (key === "operator") {
        next.operator = Math.min(value, SHARE_PERCENT - prev.community);
        next.vendor = SHARE_PERCENT - next.operator - prev.community;
      } else {
        next.community = Math.min(value, SHARE_PERCENT - prev.operator);
        next.vendor = SHARE_PERCENT - prev.operator - next.community;
      }
      return next;
    });
  }, []);

  const toggleRegenerative = useCallback((enabled: boolean) => {
    setRegenerative(enabled);
    setSplits((prev) => {
      const community = enabled ? 5 : 0;
      const operator = Math.min(prev.operator, SHARE_PERCENT - community);
      return { vendor: SHARE_PERCENT - operator - community, operator, community };
    });
  }, []);

  // ── Launch (step 4): POST + read SSE progress ──
  const launch = useCallback(async () => {
    if (launchInFlight.current) return;
    launchInFlight.current = true;
    setLaunchError(null);
    setLaunchStates({ accounts: "pending", deploy: "pending", store: "pending" });

    try {
      const res = await fetch("/api/marketplaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          description,
          category,
          vendorBps: splits.vendor * 100,
          operatorBps: splits.operator * 100,
          communityBps: splits.community * 100,
          regenerativeEnabled: regenerative,
          rewardsEnabled: regenerative && rewards,
          ...communitySubmission(community),
        }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Launch failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const chunk of events) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as
            | { type: "step"; step: LaunchStepId; status: "start" | "done" }
            | { type: "complete"; marketplace: LaunchResult & { slug: string } }
            | { type: "error"; message: string };
          if (event.type === "step") {
            setLaunchStates((prev) => ({
              ...prev,
              [event.step]: event.status === "start" ? "active" : "done",
            }));
          } else if (event.type === "complete") {
            setResult({ ...event.marketplace, name });
          } else {
            throw new Error(event.message);
          }
        }
      }
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : "Launch failed");
    } finally {
      launchInFlight.current = false;
    }
  }, [name, slug, description, category, splits, regenerative, rewards, community]);

  const startLaunch = () => {
    setStep(2);
    void launch();
  };

  // ── Per-step validity ──
  const step1Valid =
    name.trim().length >= 2 && (slugStatus === "available");

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader />
      <main id="main-content" tabIndex={-1} className="wizard-layout">
        <aside className="wizard-aside"><p className="eyebrow">Bring your people together</p><h2>Big things start with a small community.</h2><p>Hi {operatorName.split(" ")[0]}, let’s make a home for your sellers and the things that make your community special.</p><MarketArt variant="grow" /><p><strong className="text-slate-700">A simple start.</strong><br />Give it a name. Choose how sales are shared. Then invite your first sellers.</p></aside>
        <div>
        <ProgressBar current={step} />

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {step === 0 && (
            <StepCard
              title="Tell your community’s story"
              subtitle="Give your marketplace a name and help people know what they’ll find."
            >
              <Field label="Marketplace name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mercado Verde"
                  className={inputClass}
                  autoFocus
                />
              </Field>

              <Field label="Your marketplace URL">
                <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 focus-within:border-brand-500">
                  <span className="whitespace-nowrap bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                    compaki.app/m/
                  </span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setCustomSlug(slugify(e.target.value))}
                    placeholder="mercado-verde"
                    className="w-full px-3 py-2.5 text-sm text-slate-900 outline-none"
                  />
                  <span className="px-3 text-sm">
                    {slugStatus === "checking" && <span className="text-slate-400">…</span>}
                    {slugStatus === "available" && <span className="text-emerald-600">✓</span>}
                    {(slugStatus === "taken" || slugStatus === "invalid") && (
                      <span className="text-red-500">✕</span>
                    )}
                  </span>
                </div>
                {slugStatus === "taken" && (
                  <p className="mt-1.5 text-xs text-red-500">That URL is already taken.</p>
                )}
              </Field>

              <Field label="One-line description">
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Fresh coffee, straight from the growers."
                  maxLength={200}
                  className={inputClass}
                />
              </Field>

              <Field label="Category">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className={inputClass}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>

              <WizardNav onNext={() => setStep(1)} nextDisabled={!step1Valid} />
            </StepCard>
          )}

          {step === 1 && (
            <StepCard
              title="Make every sale work for everyone"
              subtitle={`Choose what sellers keep, your marketplace fee, and an optional community contribution. Together they make up ${SHARE_PERCENT}%; Compaki keeps a fixed ${PLATFORM_PERCENT}%.`}
            >
              <SplitSlider
                label="Sellers"
                hint="what the seller keeps"
                value={splits.vendor}
                onChange={(v) => setSplit("vendor", v)}
                color="bg-navy-900"
              />
              <SplitSlider
                label="Your marketplace"
                hint="your marketplace fee"
                value={splits.operator}
                onChange={(v) => setSplit("operator", v)}
                color="bg-slate-400"
              />
              <SplitSlider
                label="Community fund"
                hint={regenerative ? "goes to your community fund" : "turn on community contributions below"}
                value={splits.community}
                onChange={(v) => setSplit("community", v)}
                color="bg-emerald-500"
                disabled={!regenerative}
              />
              <div className="mb-5 flex items-baseline justify-between">
                <span className="text-sm font-medium text-slate-700">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full bg-brand-500" />
                  Compaki
                  <span className="ml-2 text-xs font-normal text-slate-400">platform fee · fixed</span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-slate-900">{PLATFORM_PERCENT}%</span>
              </div>

              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="bg-navy-900 transition-all" style={{ width: `${splits.vendor}%` }} />
                <div className="bg-slate-400 transition-all" style={{ width: `${splits.operator}%` }} />
                <div className="bg-emerald-500 transition-all" style={{ width: `${splits.community}%` }} />
                <div className="bg-brand-500" style={{ width: `${PLATFORM_PERCENT}%` }} />
              </div>
              <p className="mt-1 text-right text-xs font-medium text-slate-500">
                Total: {splits.vendor + splits.operator + splits.community + PLATFORM_PERCENT}%
              </p>

              <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                <label className="flex cursor-pointer items-center justify-between">
                  <span>
                    <span className="text-sm font-medium text-slate-900">
                      Give a share back to your community
                    </span>
                    {regenerative && (
                      <span className="mt-1 block text-xs text-slate-600">
                        A share of every sale goes to a transparent community fund.
                      </span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={regenerative}
                    onChange={(e) => toggleRegenerative(e.target.checked)}
                    className="h-5 w-5 accent-emerald-600"
                  />
                </label>
                {regenerative && (
                  <label className="mt-4 flex cursor-pointer items-start justify-between gap-4 border-t border-emerald-100 pt-4">
                    <span>
                      <span className="text-sm font-medium text-slate-900">
                        Share community rewards with members
                      </span>
                      <span className="mt-1 block text-xs text-slate-600">
                        Save the community contribution in a protected fund and share it with members you choose. Each period has fixed shares. You must open a rewards period before accepting sales. This choice is permanent after launch.
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={rewards}
                      onChange={(e) => setRewards(e.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
                    />
                  </label>
                )}
              </div>
              {regenerative && <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/50 p-5"><CommunityFields value={community} onChange={setCommunity} rewardsEnabled={rewards} /></div>}
              {regenerative && rewards && splits.community === 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  Community Rewards needs a community share above 0%.
                </p>
              )}

              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-700">
                  When a seller sells a $100 product, the buyer pays $100:
                </p>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                  <li>
                    The seller receives <strong className="text-slate-900">${splits.vendor.toFixed(2)}</strong>
                  </li>
                  <li>
                    Your marketplace keeps <strong className="text-slate-900">${splits.operator.toFixed(2)}</strong> as its fee
                  </li>
                  {splits.community > 0 && (
                    <li>
                      The community fund receives <strong className="text-slate-900">${splits.community.toFixed(2)}</strong>
                    </li>
                  )}
                  <li>
                    Compaki keeps <strong className="text-slate-900">${PLATFORM_PERCENT.toFixed(2)}</strong> as its platform fee
                  </li>
                </ul>
                <p className="mt-3 text-[11px] text-slate-500">
                  Fees come out of the sale price — buyers never pay extra, and sellers get their share in seconds.
                </p>
              </div>
              <div role="note" className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <span aria-hidden>⚠</span>
                <span>
                  <strong>These percentages can&apos;t be changed after launch.</strong> They&apos;re written into the
                  smart contract that pays out every sale{name ? ` at ${name}` : ""}. To use different ones later
                  you&apos;d need to launch a new marketplace.
                </span>
              </div>
              <WizardNav
                onBack={() => setStep(0)}
                onNext={startLaunch}
                nextLabel="Launch my marketplace"
                nextDisabled={(regenerative && rewards && splits.community === 0) || (splits.community > 0 && !communityDraftValid(community))}
              />
            </StepCard>
          )}

          {step === 2 && (
            <StepCard
              title={result ? "" : "Launching your marketplace"}
              subtitle={result ? "" : "This takes about half a minute. We’re preparing your demo store and payment accounts."}
            >
              {!result && (
                <div className="space-y-4 py-2">
                  {LAUNCH_STEPS.map(({ id, label }) => (
                    <LaunchRow key={id} label={label} state={launchStates[id]} />
                  ))}
                  {launchError && (
                    <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4">
                      <p className="text-sm text-red-600">{launchError}</p>
                      <button
                        onClick={() => void launch()}
                        className="mt-3 rounded-full bg-navy-900 px-5 py-2 text-sm font-medium text-white hover:bg-navy-700"
                      >
                        Retry launch
                      </button>
                    </div>
                  )}
                </div>
              )}

              {result && (
                <div className="py-4 text-center">
                  <p className="text-5xl">🎉</p>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
                    {result.name} is live
                  </h2>
                  <p className="mt-3 text-slate-600">Your marketplace address:</p>
                  <Link
                    href={result.path}
                    className="mt-1 inline-block rounded-lg bg-slate-50 px-4 py-2 font-mono text-sm text-slate-900 hover:bg-slate-100"
                  >
                    {result.url}
                  </Link>
                  <div className="mt-8">
                    <Link
                      href={result.dashboardPath}
                      className="rounded-full bg-navy-900 px-8 py-3.5 text-base font-medium text-white shadow-sm transition hover:bg-navy-700"
                    >
                      Go to your dashboard
                    </Link>
                  </div>
                  {result.verifyUrl && (
                    <p className="mt-10 text-xs text-slate-400">
                      <a
                        href={result.verifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-dotted underline-offset-2 hover:text-slate-600"
                      >
                        verified on-chain ↗
                      </a>
                    </p>
                  )}
                </div>
              )}
            </StepCard>
          )}
        </div>
        </div>
      </main>
    </div>
  );
}

// ─── Small building blocks ───────────────────────────────────────────────

const inputClass =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 bg-white";

function ProgressBar({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2">
      {WIZARD_STEPS.map((label, i) => (
        <li key={label} aria-current={i === current ? "step" : undefined} className="flex flex-1 flex-col gap-2">
          <span
            className={`h-1.5 rounded-full transition-colors ${
              i <= current ? "bg-navy-900" : "bg-slate-200"
            }`}
          />
          <span
            className={`text-xs font-medium ${i <= current ? "text-slate-900" : "text-slate-400"}`}
          >
            {i + 1}. {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {title && (
        <>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-6" />
        </>
      )}
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>{children}</label>
    </div>
  );
}

function WizardNav({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="mt-8 flex items-center justify-between">
      {onBack ? (
        <button
          onClick={onBack}
          className="rounded-full px-5 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          ← Back
        </button>
      ) : (
        <span />
      )}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="rounded-full bg-navy-900 px-7 py-2.5 text-sm font-medium text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {nextLabel}
      </button>
    </div>
  );
}

function LaunchRow({ label, state }: { label: string; state: LaunchStepState }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-6 w-6 items-center justify-center">
        {state === "pending" && <span className="h-2 w-2 rounded-full bg-slate-200" />}
        {state === "active" && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-navy-900" />
        )}
        {state === "done" && <span className="text-emerald-600">✓</span>}
      </span>
      <span
        className={`text-sm ${
          state === "pending"
            ? "text-slate-400"
            : state === "active"
              ? "font-medium text-slate-900"
              : "text-slate-600"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function SplitSlider({
  label,
  hint,
  value,
  onChange,
  color,
  disabled = false,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  color: string;
  disabled?: boolean;
}) {
  return (
    <div className={`mb-5 ${disabled ? "opacity-50" : ""}`}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-700">
          <span className={`mr-2 inline-block h-2 w-2 rounded-full ${color}`} />
          {label}
          <span className="ml-2 text-xs font-normal text-slate-400">{hint}</span>
        </span>
        <span className="text-sm font-semibold tabular-nums text-slate-900">{value}%</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={0}
        max={SHARE_PERCENT}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-600"
      />
    </div>
  );
}
