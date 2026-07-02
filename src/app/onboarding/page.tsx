"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { slugify } from "@/lib/slug";

// ─── Types ───────────────────────────────────────────────────────────────

const CATEGORIES = ["Coffee & agriculture", "Crafts", "Services", "Other"] as const;
type Category = (typeof CATEGORIES)[number];

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
  { id: "deploy", label: "Deploying your marketplace..." },
  { id: "store", label: "Setting up your store..." },
];

const WIZARD_STEPS = ["About", "Revenue split", "Your account", "Launch"];

// ─── Page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
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
  const [splits, setSplits] = useState<Splits>({ vendor: 90, operator: 10, community: 0 });
  const [regenerative, setRegenerative] = useState(false);

  // Step 3
  const [operatorName, setOperatorName] = useState("");
  const [operatorEmail, setOperatorEmail] = useState("");

  // Step 4
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
        next.vendor = Math.min(value, 100 - prev.community);
        next.operator = 100 - next.vendor - prev.community;
      } else if (key === "operator") {
        next.operator = Math.min(value, 100 - prev.community);
        next.vendor = 100 - next.operator - prev.community;
      } else {
        next.community = Math.min(value, 100 - prev.operator);
        next.vendor = 100 - prev.operator - next.community;
      }
      return next;
    });
  }, []);

  const toggleRegenerative = useCallback((enabled: boolean) => {
    setRegenerative(enabled);
    setSplits((prev) => {
      const community = enabled ? 5 : 0;
      const operator = Math.min(prev.operator, 100 - community);
      return { vendor: 100 - operator - community, operator, community };
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
          operatorName,
          operatorEmail,
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
  }, [name, slug, description, category, splits, regenerative, operatorName, operatorEmail]);

  const startLaunch = () => {
    setStep(3);
    void launch();
  };

  // ── Per-step validity ──
  const step1Valid =
    name.trim().length >= 2 && (slugStatus === "available" || slugStatus === "checking");
  const step3Valid =
    operatorName.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(operatorEmail);

  return (
    <div className="min-h-screen bg-slate-50/60">
      <header className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
              C
            </span>
            <span className="text-lg font-semibold tracking-tight text-slate-900">Compaki</span>
          </Link>
          <span className="text-sm text-slate-500">Create your marketplace</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <ProgressBar current={step} />

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {step === 0 && (
            <StepCard
              title="About your marketplace"
              subtitle="What are you building? You can change all of this later."
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
                <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 focus-within:border-slate-400">
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
              title="Revenue split"
              subtitle="Every sale splits automatically, the moment it happens."
            >
              <SplitSlider
                label="Vendors"
                hint="what the seller keeps"
                value={splits.vendor}
                onChange={(v) => setSplit("vendor", v)}
                color="bg-slate-900"
              />
              <SplitSlider
                label="You (operator)"
                hint="your marketplace fee"
                value={splits.operator}
                onChange={(v) => setSplit("operator", v)}
                color="bg-slate-400"
              />
              <SplitSlider
                label="Community fund"
                hint={regenerative ? "goes to your community fund" : "enable regenerative mode below"}
                value={splits.community}
                onChange={(v) => setSplit("community", v)}
                color="bg-emerald-500"
                disabled={!regenerative}
              />

              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="bg-slate-900 transition-all" style={{ width: `${splits.vendor}%` }} />
                <div className="bg-slate-400 transition-all" style={{ width: `${splits.operator}%` }} />
                <div className="bg-emerald-500 transition-all" style={{ width: `${splits.community}%` }} />
              </div>
              <p className="mt-1 text-right text-xs font-medium text-slate-500">
                Total: {splits.vendor + splits.operator + splits.community}%
              </p>

              <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                <label className="flex cursor-pointer items-center justify-between">
                  <span>
                    <span className="text-sm font-medium text-slate-900">
                      Enable regenerative mode
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
              </div>

              <WizardNav onBack={() => setStep(0)} onNext={() => setStep(2)} />
            </StepCard>
          )}

          {step === 2 && (
            <StepCard
              title="Your account"
              subtitle="No password needed — we'll sign you in automatically."
            >
              <Field label="Your name">
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="Ana Retana"
                  className={inputClass}
                  autoFocus
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={operatorEmail}
                  onChange={(e) => setOperatorEmail(e.target.value)}
                  placeholder="ana@example.com"
                  className={inputClass}
                />
              </Field>

              <WizardNav
                onBack={() => setStep(1)}
                onNext={startLaunch}
                nextLabel="Launch my marketplace"
                nextDisabled={!step3Valid}
              />
            </StepCard>
          )}

          {step === 3 && (
            <StepCard
              title={result ? "" : "Launching your marketplace"}
              subtitle={result ? "" : "This takes about half a minute — real payment rails are being set up."}
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
                        className="mt-3 rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700"
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
                      className="rounded-full bg-slate-900 px-8 py-3.5 text-base font-medium text-white shadow-sm transition hover:bg-slate-700"
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
      </main>
    </div>
  );
}

// ─── Small building blocks ───────────────────────────────────────────────

const inputClass =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 bg-white";

function ProgressBar({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2">
      {WIZARD_STEPS.map((label, i) => (
        <li key={label} className="flex flex-1 flex-col gap-1.5">
          <span
            className={`h-1.5 rounded-full transition-colors ${
              i <= current ? "bg-slate-900" : "bg-slate-200"
            }`}
          />
          <span
            className={`text-xs font-medium ${i <= current ? "text-slate-900" : "text-slate-400"}`}
          >
            {label}
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
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
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
        className="rounded-full bg-slate-900 px-7 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
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
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
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
        min={0}
        max={100}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-slate-900"
      />
    </div>
  );
}
