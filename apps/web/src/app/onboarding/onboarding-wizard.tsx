"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { CommunityFields } from "@/components/community-fields";
import {
  CommunityRulesFields,
  communityRulesError,
  communityRulesSubmission,
  defaultCommunityRules,
} from "@/components/community-rules";
import { Icon } from "@/components/icon";
import { MarketArt } from "@/components/market-art";
import { DemoNotice, Logo } from "@/components/shell";
import { UserMenu } from "@/components/user-menu";
import {
  emptyCommunityDraft,
  communityDraftValid,
  communitySubmission,
} from "@/lib/community";
import { frequencyLabel, POLICY_TEXT } from "@/lib/rewards";
import { isValidSlug, slugify } from "@/lib/slug";

const CATEGORIES = [
  { name: "Coffee & agriculture", icon: "leaf", detail: "Grown with care" },
  { name: "Crafts", icon: "spark", detail: "Made by your people" },
  { name: "Services", icon: "people", detail: "Skills worth sharing" },
  { name: "Other", icon: "grid", detail: "A little of everything" },
] as const;
type Category = (typeof CATEGORIES)[number]["name"];
const PLATFORM_PERCENT = 2;
const SHARE_PERCENT = 100 - PLATFORM_PERCENT;
interface Splits {
  vendor: number;
  operator: number;
  community: number;
}
type SlugStatus =
  "idle" | "checking" | "available" | "taken" | "invalid" | "error";
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
  { id: "accounts", label: "Preparing payment accounts" },
  { id: "deploy", label: "Saving your marketplace rules" },
  { id: "store", label: "Opening your marketplace" },
];
const STEP_TITLES = [
  "Give your marketplace a little personality.",
  "Make every sale work for your people.",
  "Show people the good they make possible.",
  "A last look. Then let’s open your doors.",
];
const STEP_COPY = [
  "A name, a short story and a place your community can call its own.",
  "Choose your marketplace fee and whether each sale supports a shared purpose.",
  "Explain who benefits, how contributions are used and when they’re shared.",
  "Check the details below. Nothing is published until you choose to launch.",
];

export function OnboardingWizard({ operatorName }: { operatorName: string }) {
  // Internal stages are stable even when the optional community step is skipped.
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [customSlug, setCustomSlug] = useState<string | null>(null);
  const slug = customSlug ?? slugify(name);
  const [slugCheck, setSlugCheck] = useState<{
    slug: string;
    status: SlugStatus;
  }>({ slug: "", status: "idle" });
  const [slugRetry, setSlugRetry] = useState(0);
  const slugStatus: SlugStatus =
    slug === ""
      ? "idle"
      : !isValidSlug(slug)
        ? "invalid"
        : slugCheck.slug === slug
          ? slugCheck.status
          : "checking";
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("Coffee & agriculture");
  const [splits, setSplits] = useState<Splits>({
    vendor: 93,
    operator: 5,
    community: 0,
  });
  const [regenerative, setRegenerative] = useState(false);
  const [rules, setRules] = useState(defaultCommunityRules);
  const [community, setCommunity] = useState(emptyCommunityDraft);
  const mode = regenerative ? rules.mode : "classic";
  const [acknowledged, setAcknowledged] = useState(false);
  const [editingReview, setEditingReview] = useState(false);
  const [launchStates, setLaunchStates] = useState<
    Record<LaunchStepId, LaunchStepState>
  >({ accounts: "pending", deploy: "pending", store: "pending" });
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const launchInFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: "start" });
  }, [step]);

  useEffect(() => {
    if (!slug || !isValidSlug(slug)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/marketplaces/check-slug?slug=${encodeURIComponent(slug)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error("Address check failed");
        const data = (await res.json()) as {
          available: boolean;
          reason: string | null;
        };
        if (!controller.signal.aborted)
          setSlugCheck({
            slug,
            status: data.available
              ? "available"
              : data.reason === "invalid"
                ? "invalid"
                : "taken",
          });
      } catch {
        if (!controller.signal.aborted) setSlugCheck({ slug, status: "error" });
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug, slugRetry]);

  const setSplit = (key: "operator" | "community", raw: number) => {
    setAcknowledged(false);
    setSplits((prev) => {
      const value = Math.max(
        key === "community" ? 1 : 0,
        Math.min(
          SHARE_PERCENT - (key === "operator" ? prev.community : prev.operator),
          Math.round(raw),
        ),
      );
      const next = { ...prev, [key]: value };
      return {
        ...next,
        vendor: SHARE_PERCENT - next.operator - next.community,
      };
    });
  };
  const toggleCommunity = (enabled: boolean) => {
    setRegenerative(enabled);
    setAcknowledged(false);
    setSplits((prev) => {
      const community = enabled ? 5 : 0;
      const operator = Math.min(prev.operator, SHARE_PERCENT - community);
      return {
        vendor: SHARE_PERCENT - operator - community,
        operator,
        community,
      };
    });
  };

  const launch = useCallback(async () => {
    if (launchInFlight.current) return;
    launchInFlight.current = true;
    setLaunchError(null);
    setLaunchStates({
      accounts: "pending",
      deploy: "pending",
      store: "pending",
    });

    try {
      const res = await fetch("/api/marketplaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug,
          description: description.trim(),
          category,
          vendorBps: splits.vendor * 100,
          operatorBps: splits.operator * 100,
          communityBps: splits.community * 100,
          regenerativeEnabled: regenerative,
          ...communitySubmission(community),
          ...communityRulesSubmission({ ...rules, mode }),
        }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `Launch failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      for (;;) {
        const { done, value } = await reader.read();
        buffer += done
          ? decoder.decode()
          : decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = done ? "" : (events.pop() ?? "");
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
            completed = true;
            setResult({ ...event.marketplace, name: name.trim() });
          } else {
            throw new Error(event.message);
          }
        }
        if (done) break;
      }
      reader.releaseLock();
      if (!completed)
        throw new Error(
          "The connection was interrupted. Retry to finish setting up your marketplace.",
        );
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : "Launch failed");
    } finally {
      launchInFlight.current = false;
    }
  }, [
    name,
    slug,
    description,
    category,
    splits,
    regenerative,
    rules,
    mode,
    community,
  ]);

  const steps = [
    { id: 0, label: "The basics" },
    { id: 1, label: "Sales & sharing" },
    ...(regenerative ? [{ id: 2, label: "Your purpose" }] : []),
    { id: 3, label: "Review & launch" },
  ];
  const activeIndex = steps.findIndex((item) => item.id === Math.min(step, 3));
  const step1Valid =
    name.trim().length >= 2 &&
    name.trim().length <= 60 &&
    slugStatus === "available";
  const communityError = regenerative
    ? communityRulesError({ ...rules, mode })
    : null;
  const purposeValid =
    !regenerative ||
    (splits.community > 0 &&
      communityDraftValid(community, mode) &&
      communityError === null);
  const modelLabel =
    mode === "rewards"
      ? "Rewards for sellers & buyers"
      : mode === "fundraise"
        ? "A fundraising goal"
        : "An organizer-managed fund";
  const onContinue = () => {
    if (step === 0 && step1Valid) {
      setStep(editingReview ? (purposeValid ? 3 : 2) : 1);
      if (editingReview && purposeValid) setEditingReview(false);
    } else if (step === 1) {
      const next = regenerative && (!editingReview || !purposeValid) ? 2 : 3;
      setStep(next);
      if (next === 3) setEditingReview(false);
    } else if (step === 2 && purposeValid) {
      setStep(3);
      setEditingReview(false);
    } else if (step === 3 && step1Valid && purposeValid && acknowledged) {
      setStep(4);
      void launch();
    }
  };
  const edit = (target: number) => {
    setAcknowledged(false);
    setEditingReview(true);
    setStep(target);
  };
  const back = () => {
    setAcknowledged(false);
    if (editingReview) {
      setEditingReview(false);
      setStep(3);
    } else setStep(step === 3 ? (regenerative ? 2 : 1) : Math.max(0, step - 1));
  };
  const slugMessage = {
    idle: "We’ll create a shareable address from your name.",
    checking: "Checking your address…",
    available: "This address is available. Make it yours.",
    taken: "This address is taken. Try adding your town or another word.",
    invalid:
      "Use 1–40 letters, numbers or hyphens, ending with a letter or number.",
    error: "We couldn’t check this address. Try again.",
  }[slugStatus];

  return (
    <div className="onboarding-page">
      <DemoNotice />
      <header className="onboarding-header">
        <Link href="/" aria-label="Compaki home">
          <Logo />
        </Link>
        <div>
          <Link href="/marketplaces" className="onboarding-exit">
            Back to marketplaces
          </Link>
          <UserMenu />
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="onboarding-main">
        <div className="onboarding-intro">
          <div>
            <p className="eyebrow">Your people. Your marketplace.</p>
            <p className="onboarding-greeting">
              Let’s build something good
              {operatorName.split(/\s+/)[0]
                ? `, ${operatorName.split(/\s+/)[0]}`
                : ""}
              .
            </p>
          </div>
          <span>
            <Icon name="shield" className="h-4 w-4" />
            Review everything before you launch
          </span>
        </div>
        <nav
          aria-label="Marketplace setup progress"
          className="onboarding-progress"
        >
          <ol>
            {steps.map((item, i) => (
              <li
                key={item.id}
                aria-label={`Step ${i + 1}: ${item.label}`}
                aria-current={i === activeIndex && !result ? "step" : undefined}
                data-complete={i < activeIndex || !!result}
              >
                <span className="onboarding-step-number">
                  {i < activeIndex || result ? (
                    <Icon name="check" className="h-3.5 w-3.5" />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <span>{item.label}</span>
                {i !== steps.length - 1 && (
                  <span className="onboarding-step-line" aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
          <p>
            Step {activeIndex + 1} of {steps.length}
          </p>
        </nav>
        <div className="onboarding-layout">
          <section className="onboarding-card">
            <div className="onboarding-card-heading">
              <span className="onboarding-card-icon">
                <Icon
                  name={
                    step === 0
                      ? "store"
                      : step === 1
                        ? "people"
                        : step === 2
                          ? "heart"
                          : step === 4
                            ? result
                              ? "check"
                              : "spark"
                            : "leaf"
                  }
                />
              </span>
              <p className="eyebrow">
                {step === 4
                  ? result
                    ? "Ready for your people"
                    : "Bringing it to life"
                  : `Step ${activeIndex + 1} · ${steps[activeIndex].label}`}
              </p>
              <h1 ref={headingRef} tabIndex={-1}>
                {step === 4
                  ? result
                    ? `${result.name} is open.`
                    : "Good things are on their way."
                  : STEP_TITLES[step]}
              </h1>
              <p>
                {step === 4
                  ? result
                    ? "Your marketplace is ready. Add your first sellers and give your community a reason to stop by."
                    : "We’re getting your demo marketplace ready. This may take a little while; keep this page open."
                  : STEP_COPY[step]}
              </p>
            </div>
            {step < 4 ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  onContinue();
                }}
              >
                {step === 0 && (
                  <div className="onboarding-fields">
                    <Field
                      label="Marketplace name"
                      id="marketplace-name"
                      hint="A name your community will recognize."
                    >
                      <input
                        id="marketplace-name"
                        autoComplete="organization"
                        value={name}
                        required
                        minLength={2}
                        maxLength={60}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Mercado Verde"
                        aria-describedby="marketplace-name-hint"
                      />
                    </Field>
                    <Field
                      label="Your marketplace address"
                      id="marketplace-slug"
                    >
                      <div className="onboarding-url">
                        <span>compaki.app/m/</span>
                        <input
                          id="marketplace-slug"
                          value={slug}
                          maxLength={40}
                          required
                          onChange={(e) =>
                            setCustomSlug(slugify(e.target.value))
                          }
                          placeholder="mercado-verde"
                          aria-describedby="marketplace-slug-status"
                          aria-invalid={
                            slugStatus === "taken" || slugStatus === "invalid"
                          }
                          autoCapitalize="none"
                          spellCheck={false}
                        />
                        <span aria-hidden="true">
                          {slugStatus === "available" ? (
                            <Icon name="check" className="h-4 w-4" />
                          ) : slugStatus === "checking" ? (
                            <span className="login-spinner" />
                          ) : null}
                        </span>
                      </div>
                      <div
                        id="marketplace-slug-status"
                        role="status"
                        className={`onboarding-field-hint onboarding-slug-${slugStatus}`}
                      >
                        {slugMessage}
                        {slugStatus === "error" && (
                          <button
                            type="button"
                            onClick={() => {
                              setSlugCheck({ slug, status: "checking" });
                              setSlugRetry((v) => v + 1);
                            }}
                          >
                            Check again
                          </button>
                        )}
                      </div>
                    </Field>
                    <Field
                      label="What will people find here?"
                      id="marketplace-description"
                      optional
                    >
                      <textarea
                        id="marketplace-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        maxLength={200}
                        rows={3}
                        placeholder="Fresh produce, thoughtful makers and good things from our neighborhood."
                        aria-describedby="marketplace-description-hint"
                      />
                      <div
                        id="marketplace-description-hint"
                        className="onboarding-textarea-hint"
                      >
                        <span>A short introduction for your storefront.</span>
                        <span>{description.length}/200</span>
                      </div>
                    </Field>
                    <fieldset className="onboarding-categories">
                      <legend>Choose a category</legend>
                      <div>
                        {CATEGORIES.map((c) => (
                          <label
                            key={c.name}
                            data-selected={category === c.name}
                          >
                            <input
                              type="radio"
                              name="marketplace-category"
                              value={c.name}
                              checked={category === c.name}
                              onChange={() => setCategory(c.name)}
                            />
                            <Icon name={c.icon} />
                            <span>
                              <strong>{c.name}</strong>
                              <small>{c.detail}</small>
                            </span>
                            <span
                              className="onboarding-radio-indicator"
                              aria-hidden="true"
                            >
                              {category === c.name && (
                                <Icon name="check" className="h-3 w-3" />
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                )}
                {step === 1 && (
                  <div className="onboarding-fields">
                    <div className="onboarding-share-heading">
                      <span>
                        <Icon name="bag" />
                        Sellers keep
                      </span>
                      <strong>{splits.vendor}%</strong>
                      <p>
                        Calculated automatically after the fees and
                        contributions below.
                      </p>
                    </div>
                    <SplitSlider
                      label="Your marketplace fee"
                      hint="Your share for running the marketplace."
                      value={splits.operator}
                      max={SHARE_PERCENT - splits.community}
                      onChange={(v) => setSplit("operator", v)}
                    />
                    <div className="onboarding-community-choice">
                      <label>
                        <span className="onboarding-choice-icon">
                          <Icon name="heart" />
                        </span>
                        <span>
                          <strong>Give something back</strong>
                          <small>
                            Set aside a share of every sale for your community.
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={regenerative}
                          onChange={(e) => toggleCommunity(e.target.checked)}
                        />
                        <span
                          className="onboarding-switch"
                          aria-hidden="true"
                        />
                      </label>
                      {regenerative && (
                        <div className="onboarding-community-slider">
                          <SplitSlider
                            label="Community contribution"
                            hint="You’ll choose who benefits in the next step."
                            value={splits.community}
                            min={1}
                            max={SHARE_PERCENT - splits.operator}
                            onChange={(v) => setSplit("community", v)}
                          />
                        </div>
                      )}
                    </div>
                    <div className="onboarding-fixed-fee">
                      <span>
                        <Icon name="leaf" className="h-4 w-4" />
                        <strong>Compaki platform fee</strong>
                        <small>Included in every sale</small>
                      </span>
                      <strong>{PLATFORM_PERCENT}%</strong>
                    </div>
                    <div className="onboarding-mobile-example">
                      <h2>How a $100 sale is shared</h2>
                      <SaleBreakdown splits={splits} />
                    </div>
                    <div className="onboarding-info">
                      <Icon name="check" className="h-4 w-4" />
                      <p>
                        All shares come out of the product price. Buyers pay the
                        price they see.
                      </p>
                    </div>
                  </div>
                )}
                {step === 2 && (
                  <div className="onboarding-fields onboarding-purpose">
                    <CommunityRulesFields
                      value={rules}
                      onChange={(value) => {
                        setRules(value);
                        setAcknowledged(false);
                      }}
                      communityPercent={splits.community}
                    />
                    <div className="onboarding-story-fields">
                      <CommunityFields
                        value={community}
                        onChange={setCommunity}
                        mode={mode}
                      />
                    </div>
                    {!purposeValid && !communityError && (
                      <p className="onboarding-completion-hint">
                        Add your purpose, who benefits and any required
                        distribution details to continue.
                      </p>
                    )}
                  </div>
                )}
                {step === 3 && (
                  <div className="onboarding-review">
                    <ReviewSection
                      title="Your marketplace"
                      onEdit={() => edit(0)}
                    >
                      <dl>
                        <div>
                          <dt>Name</dt>
                          <dd>{name.trim()}</dd>
                        </div>
                        <div>
                          <dt>Category</dt>
                          <dd>{category}</dd>
                        </div>
                        <div className="onboarding-review-wide">
                          <dt>Address</dt>
                          <dd>compaki.app/m/{slug}</dd>
                        </div>
                        {description.trim() && (
                          <div className="onboarding-review-wide">
                            <dt>Introduction</dt>
                            <dd>{description}</dd>
                          </div>
                        )}
                      </dl>
                    </ReviewSection>
                    <ReviewSection
                      title="How every sale is shared"
                      onEdit={() => edit(1)}
                    >
                      <SaleBreakdown splits={splits} />
                      <p className="onboarding-field-hint">
                        No extra fee is added for buyers.
                      </p>
                    </ReviewSection>
                    {regenerative ? (
                      <ReviewSection
                        title="Your community purpose"
                        onEdit={() => edit(2)}
                      >
                        <dl>
                          <div className="onboarding-review-wide">
                            <dt>How it works</dt>
                            <dd>{modelLabel}</dd>
                          </div>
                          <div className="onboarding-review-wide">
                            <dt>What purchases make possible</dt>
                            <dd>{community.communityPurpose}</dd>
                          </div>
                          <div className="onboarding-review-wide">
                            <dt>Who benefits</dt>
                            <dd>{community.communityBeneficiaries}</dd>
                          </div>
                          {community.communityDistribution && (
                            <div className="onboarding-review-wide">
                              <dt>How funds are used & shared</dt>
                              <dd>{community.communityDistribution}</dd>
                            </div>
                          )}
                          {mode === "rewards" && (
                            <>
                              <div>
                                <dt>Rewards available</dt>
                                <dd>{frequencyLabel(rules.periodSeconds)}</dd>
                              </div>
                              <div>
                                <dt>Rewards split</dt>
                                <dd>
                                  {rules.sellersPercent}% sellers ·{" "}
                                  {100 - rules.sellersPercent}% buyers
                                </dd>
                              </div>
                            </>
                          )}
                          {mode === "fundraise" && (
                            <>
                              <div>
                                <dt>Fundraising target</dt>
                                <dd>
                                  $
                                  {Number(rules.goalUsd).toLocaleString(
                                    "en-US",
                                    { minimumFractionDigits: 2 },
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt>After each payout</dt>
                                <dd>{POLICY_TEXT[rules.policy].label}</dd>
                              </div>
                              <div className="onboarding-review-wide">
                                <dt>Payment recipients</dt>
                                <dd>
                                  <ul className="onboarding-recipients-review">
                                    {rules.recipients.map((r, i) => (
                                      <li key={i}>
                                        <strong>
                                          {r.label} · {r.percent}%
                                        </strong>
                                        <code>{r.address}</code>
                                      </li>
                                    ))}
                                  </ul>
                                </dd>
                              </div>
                            </>
                          )}
                          {mode === "classic" && community.communityGoalUsd && (
                            <div>
                              <dt>Community goal</dt>
                              <dd>
                                $
                                {Number(
                                  community.communityGoalUsd,
                                ).toLocaleString("en-US")}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </ReviewSection>
                    ) : (
                      <div className="onboarding-no-community">
                        <Icon name="people" />
                        <p>
                          No community contribution. Sellers receive{" "}
                          {splits.vendor}% and your marketplace receives{" "}
                          {splits.operator}% of each sale.
                        </p>
                        <button type="button" onClick={() => edit(1)}>
                          Edit
                        </button>
                      </div>
                    )}
                    <div className="onboarding-launch-note">
                      <Icon name="shield" />
                      <div>
                        <strong>A few details are here to stay.</strong>
                        <p>
                          Sales percentages
                          {regenerative && mode === "rewards"
                            ? " and reward rules"
                            : regenerative && mode === "fundraise"
                              ? ", fundraising target, payout rules and recipient accounts"
                              : ""}{" "}
                          are fixed once you launch. To change them, you’ll need
                          a new marketplace.{" "}
                          {regenerative
                            ? "Your community story can be edited later."
                            : "Check your details carefully before continuing."}
                        </p>
                      </div>
                    </div>
                    <label className="onboarding-acknowledge">
                      <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                        required
                      />
                      <span>
                        I’ve reviewed the sales shares
                        {regenerative ? " and community details" : ""} and I’m
                        ready to launch.
                      </span>
                    </label>
                    {(!step1Valid || !purposeValid) && (
                      <p role="alert" className="onboarding-completion-hint">
                        Review your marketplace address and required details
                        before launching.
                      </p>
                    )}
                  </div>
                )}
                <div className="onboarding-nav">
                  <div>
                    {step > 0 || editingReview ? (
                      <button
                        type="button"
                        className="onboarding-back"
                        onClick={back}
                      >
                        {editingReview ? "← Back to review" : "← Back"}
                      </button>
                    ) : (
                      <span className="onboarding-first-step-note">
                        Make it yours. You can review it all next.
                      </span>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="button-primary"
                    disabled={
                      step === 0
                        ? !step1Valid
                        : step === 2
                          ? !purposeValid
                          : step === 3
                            ? !acknowledged || !step1Valid || !purposeValid
                            : false
                    }
                  >
                    {step === 3
                      ? "Launch my marketplace"
                      : editingReview
                        ? "Review changes"
                        : "Continue"}
                    <Icon name="arrow" className="h-4 w-4" />
                  </button>
                </div>
              </form>
            ) : (
              <div className="onboarding-launch" aria-live="polite">
                {!result ? (
                  <>
                    <ol>
                      {LAUNCH_STEPS.map(({ id, label }) => (
                        <li key={id} data-state={launchStates[id]}>
                          <span>
                            {launchStates[id] === "done" ? (
                              <Icon name="check" className="h-4 w-4" />
                            ) : launchStates[id] === "active" ? (
                              <span className="login-spinner" />
                            ) : (
                              <span className="onboarding-launch-dot" />
                            )}
                          </span>
                          {label}
                          <small>
                            {launchStates[id] === "done"
                              ? "Done"
                              : launchStates[id] === "active"
                                ? "In progress"
                                : "Up next"}
                          </small>
                        </li>
                      ))}
                    </ol>
                    {launchError && (
                      <div className="onboarding-launch-error" role="alert">
                        <p>{launchError}</p>
                        <button
                          type="button"
                          className="button-primary button-small"
                          onClick={() => void launch()}
                        >
                          Retry setup
                        </button>
                        <p>We’ll resume with these same settings.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="onboarding-success-address">
                      <Icon name="store" />
                      <div>
                        <span>Your marketplace address</span>
                        <Link href={result.path}>
                          {result.url}
                          <Icon name="arrow" className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                    <div className="onboarding-next-steps">
                      <p className="eyebrow">Make your first day count</p>
                      <p>
                        <span>01</span>Invite your first sellers.
                      </p>
                      <p>
                        <span>02</span>Add products people will love.
                      </p>
                      <p>
                        <span>03</span>Share your marketplace with your
                        community.
                      </p>
                    </div>
                    <Link
                      className="button-primary"
                      href={result.dashboardPath}
                    >
                      Go to my dashboard
                      <Icon name="arrow" className="h-4 w-4" />
                    </Link>
                    {result.verifyUrl && (
                      <a
                        className="onboarding-verification"
                        href={result.verifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View setup record ↗
                      </a>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
          <aside
            className="onboarding-sidebar"
            aria-label="Marketplace preview and guidance"
          >
            <div className="onboarding-preview-label">
              <span className="onboarding-preview-dot" />
              {step === 4 && result
                ? "Your new marketplace"
                : "Your storefront preview"}
            </div>
            <div className="onboarding-preview">
              <div className="onboarding-preview-art">
                <span>{category}</span>
                <MarketArt
                  variant={
                    category === "Crafts"
                      ? "craft"
                      : category === "Coffee & agriculture"
                        ? "market"
                        : "grow"
                  }
                />
              </div>
              <div className="onboarding-preview-content">
                <span className="onboarding-preview-store">
                  <Icon name="store" className="h-4 w-4" />
                </span>
                <h2>{name.trim() || "Your marketplace, here."}</h2>
                <p>
                  {description.trim() ||
                    "A place for good things, great people and your community’s story."}
                </p>
                <span className="onboarding-preview-url">
                  compaki.app/m/{slug || "your-community"}
                </span>
                {regenerative && (
                  <div className="onboarding-preview-impact">
                    <Icon name="heart" className="h-4 w-4" />
                    <span>
                      {splits.community}% of each sale supports{" "}
                      {mode === "rewards"
                        ? "community rewards"
                        : mode === "fundraise"
                          ? "a shared goal"
                          : "your community"}
                      .
                    </span>
                  </div>
                )}
              </div>
            </div>
            {step > 0 && step < 4 ? (
              <div className="onboarding-sale-example">
                <p className="eyebrow">A little clarity</p>
                <h2>
                  One $100 sale.
                  <br />
                  Good for everyone.
                </h2>
                <SaleBreakdown splits={splits} />
                <p>The buyer pays $100. Here’s where it goes.</p>
              </div>
            ) : (
              <div className="onboarding-sidebar-note">
                <Icon name="leaf" />
                <h2>
                  A home for what
                  <br />
                  makes your people special.
                </h2>
                <p>
                  Start with the basics. Invite your sellers and add your first
                  products after launch.
                </p>
                <span>
                  <Icon name="check" className="h-3.5 w-3.5" />
                  No products needed to get started
                </span>
              </div>
            )}
            {step === 2 && (
              <div className="onboarding-public-note">
                <Icon name="people" />
                <p>
                  <strong>Let your purpose do the talking.</strong>Your story,
                  contribution rules and payment recipients will be visible to
                  visitors on your community page.
                </p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  id,
  hint,
  optional,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="onboarding-field">
      <label htmlFor={id}>
        {label}
        {optional && <span>Optional</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="onboarding-field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
function SplitSlider({
  label,
  hint,
  value,
  min = 0,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="onboarding-split">
      <label>
        <span>
          <strong>{label}</strong>
          <small>{hint}</small>
        </span>
        <output>{value}%</output>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          aria-label={label}
          aria-valuetext={`${value} percent of each sale`}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
      <div className="onboarding-range-labels">
        <span>{min}%</span>
        <span>{max}%</span>
      </div>
    </div>
  );
}
function SaleBreakdown({ splits }: { splits: Splits }) {
  const parts: { label: string; value: number; color: string }[] = [
    { label: "Sellers", value: splits.vendor, color: "#456c4e" },
    { label: "Your marketplace", value: splits.operator, color: "#b59a75" },
    ...(splits.community > 0
      ? [{ label: "Community", value: splits.community, color: "#9cb375" }]
      : []),
    { label: "Compaki", value: PLATFORM_PERCENT, color: "#cdd5bc" },
  ];
  return (
    <div className="onboarding-breakdown">
      <div className="onboarding-split-bar" aria-hidden="true">
        {parts.map((part) => (
          <span
            key={part.label}
            style={{ width: `${part.value}%`, background: part.color }}
          />
        ))}
      </div>
      <ul>
        {parts.map((part) => (
          <li key={part.label}>
            <span>
              <i style={{ background: part.color }} />
              {part.label}
            </span>
            <strong>
              ${part.value.toFixed(2)}
              <small>{part.value}%</small>
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="onboarding-review-section">
      <div>
        <h2>{title}</h2>
        <button
          type="button"
          aria-label={`Edit ${title.toLowerCase()}`}
          onClick={onEdit}
        >
          Edit
        </button>
      </div>
      {children}
    </section>
  );
}
