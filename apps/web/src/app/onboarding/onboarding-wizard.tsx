"use client";
import { localizedMessage } from "@/i18n/errors";

import { categoryLabel } from "@/i18n/labels";

import { useLocale } from "next-intl";

import { useTranslations } from "next-intl";

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
import { formatUsd } from "@/lib/format";
import { frequencyLabel, getPolicyText } from "@/lib/rewards";
import { isValidSlug, slugify } from "@/lib/slug";

type Category = "Coffee & agriculture" | "Crafts" | "Services" | "Other";
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

export function OnboardingWizard({ operatorName }: { operatorName: string }) {
  const locale = useLocale();

  const t = useTranslations("ui");
  const POLICY_TEXT = getPolicyText(t);

const CATEGORIES = [
  { name: "Coffee & agriculture", icon: "leaf", detail: t("grownWithCare") },
  { name: "Crafts", icon: "spark", detail: t("madeByYourPeople") },
  { name: "Services", icon: "people", detail: t("skillsWorthSharing") },
  { name: "Other", icon: "grid", detail: t("aLittleOfEverything") },
] as const;
const LAUNCH_STEPS: { id: LaunchStepId; label: string }[] = [
  { id: "accounts", label: t("preparingPaymentAccounts") },
  { id: "deploy", label: t("savingYourMarketplaceRules") },
  { id: "store", label: t("openingYourMarketplace") },
];
const STEP_TITLES = [
  t("giveYourMarketplaceALittlePersonality"),
  t("makeEverySaleWorkForYourPeople"),
  t("showPeopleTheGoodTheyMakePossible"),
  t("aLastLookThenLetSOpenYourDoors"),
];
const STEP_COPY = [
  t("aNameAShortStoryAndAPlaceYourCommunityCan"),
  t("chooseYourMarketplaceFeeAndWhetherEachSaleSupportsAShared"),
  t("explainWhoBenefitsHowContributionsAreUsedAndWhenTheyRe"),
  t("checkTheDetailsBelowNothingIsPublishedUntilYouChooseTo"),
];

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
        if (!res.ok) throw new Error(t("addressCheckFailed"));
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
  }, [slug, slugRetry, t]);

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
        throw new Error(localizedMessage(data?.error, t, t("launchFailedValue", { value1: res.status })));
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
          t("theConnectionWasInterruptedRetryToFinishSettingUpYourMarketplace"),
        );
    } catch (error) {
      setLaunchError(localizedMessage(error, t, t("launchFailed")));
    } finally {
      launchInFlight.current = false;
    }
  }, [
    t,
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
    { id: 0, label: t("theBasics") },
    { id: 1, label: t("salesSharing") },
    ...(regenerative ? [{ id: 2, label: t("yourPurpose") }] : []),
    { id: 3, label: t("reviewLaunch") },
  ];
  const activeIndex = steps.findIndex((item) => item.id === Math.min(step, 3));
  const step1Valid =
    name.trim().length >= 2 &&
    name.trim().length <= 60 &&
    slugStatus === "available";
  const communityError = regenerative
    ? communityRulesError({ ...rules, mode }, t)
    : null;
  const purposeValid =
    !regenerative ||
    (splits.community > 0 &&
      communityDraftValid(community, mode) &&
      communityError === null);
  const modelLabel =
    mode === "rewards"
      ? t("rewardsForSellersBuyers")
      : mode === "fundraise"
        ? t("aFundraisingGoal")
        : t("anOrganizerManagedFund");
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
    idle: t("weLlCreateAShareableAddressFromYourName"),
    checking: t("checkingYourAddress"),
    available: t("thisAddressIsAvailableMakeItYours"),
    taken: t("thisAddressIsTakenTryAddingYourTownOrAnotherWord"),
    invalid:
      t("use140LettersNumbersOrHyphensEndingWithALetter"),
    error: t("weCouldnTCheckThisAddressTryAgain"),
  }[slugStatus];

  return (
    <div className="onboarding-page">
      <DemoNotice />
      <header className="onboarding-header">
        <Link href="/" aria-label={t("compakiHome")}>
          <Logo />
        </Link>
        <div>
          <Link href="/marketplaces" className="onboarding-exit">
            {t("backToMarketplaces")}</Link>
          <UserMenu />
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="onboarding-main">
        <div className="onboarding-intro">
          <div>
            <p className="eyebrow">{t("yourPeopleYourMarketplace")}</p>
            <p className="onboarding-greeting">
              {operatorName.split(/\s+/)[0]
                ? t("onboardingGreeting", { name: operatorName.split(/\s+/)[0] })
                : t("onboardingGreetingAnonymous")}
            </p>
          </div>
          <span>
            <Icon name="shield" className="h-4 w-4" />
            {t("reviewEverythingBeforeYouLaunch")}</span>
        </div>
        <nav
          aria-label={t("marketplaceSetupProgress")}
          className="onboarding-progress"
        >
          <ol>
            {steps.map((item, i) => (
              <li
                key={item.id}
                aria-label={t("stepValueValue", { value1: i + 1, value2: item.label })}
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
            {t("step")}{" "}{activeIndex + 1} {" "}{t("of")}{" "}{steps.length}
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
                    ? t("readyForYourPeople")
                    : t("bringingItToLife")
                  : t("stepValueValue2", { value1: activeIndex + 1, value2: steps[activeIndex].label })}
              </p>
              <h1 ref={headingRef} tabIndex={-1}>
                {step === 4
                  ? result
                    ? t("valueIsOpen", { value1: result.name })
                    : t("goodThingsAreOnTheirWay")
                  : STEP_TITLES[step]}
              </h1>
              <p>
                {step === 4
                  ? result
                    ? t("yourMarketplaceIsReadyAddYourFirstSellersAndGiveYour")
                    : t("weReGettingYourDemoMarketplaceReadyThisMayTakeA")
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
                      label={t("marketplaceName")}
                      id="marketplace-name"
                      hint={t("aNameYourCommunityWillRecognize")}
                    >
                      <input
                        id="marketplace-name"
                        autoComplete="organization"
                        value={name}
                        required
                        minLength={2}
                        maxLength={60}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("eGMercadoVerde")}
                        aria-describedby="marketplace-name-hint"
                      />
                    </Field>
                    <Field
                      label={t("yourMarketplaceAddress")}
                      id="marketplace-slug"
                    >
                      <div className="onboarding-url">
                        <span>{t("compakiAppM")}</span>
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
                            {t("checkAgain")}</button>
                        )}
                      </div>
                    </Field>
                    <Field
                      label={t("whatWillPeopleFindHere")}
                      id="marketplace-description"
                      optional
                    >
                      <textarea
                        id="marketplace-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        maxLength={200}
                        rows={3}
                        placeholder={t("freshProduceThoughtfulMakersAndGoodThingsFromOurNeighborhood")}
                        aria-describedby="marketplace-description-hint"
                      />
                      <div
                        id="marketplace-description-hint"
                        className="onboarding-textarea-hint"
                      >
                        <span>{t("aShortIntroductionForYourStorefront")}</span>
                        <span>{description.length}/200</span>
                      </div>
                    </Field>
                    <fieldset className="onboarding-categories">
                      <legend>{t("chooseACategory")}</legend>
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
                              <strong>{categoryLabel(c.name, t)}</strong>
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
                        {t("sellersKeep")}</span>
                      <strong>{splits.vendor}%</strong>
                      <p>
                        {t("calculatedAutomaticallyAfterTheFeesAndContributionsBelow")}</p>
                    </div>
                    <SplitSlider
                      label={t("yourMarketplaceFee")}
                      hint={t("yourShareForRunningTheMarketplace")}
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
                          <strong>{t("giveSomethingBack")}</strong>
                          <small>
                            {t("setAsideAShareOfEverySaleForYourCommunity")}</small>
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
                            label={t("communityContribution")}
                            hint={t("youLlChooseWhoBenefitsInTheNextStep")}
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
                        <strong>{t("compakiPlatformFee")}</strong>
                        <small>{t("includedInEverySale")}</small>
                      </span>
                      <strong>{PLATFORM_PERCENT}%</strong>
                    </div>
                    <div className="onboarding-mobile-example">
                      <h2>{t("howA100SaleIsShared")}</h2>
                      <SaleBreakdown splits={splits} />
                    </div>
                    <div className="onboarding-info">
                      <Icon name="check" className="h-4 w-4" />
                      <p>
                        {t("allSharesComeOutOfTheProductPriceBuyersPayThe")}</p>
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
                        {t("addYourPurposeWhoBenefitsAndAnyRequiredDistributionDetailsTo")}</p>
                    )}
                  </div>
                )}
                {step === 3 && (
                  <div className="onboarding-review">
                    <ReviewSection
                      title={t("yourMarketplace")}
                      onEdit={() => edit(0)}
                    >
                      <dl>
                        <div>
                          <dt>{t("name")}</dt>
                          <dd>{name.trim()}</dd>
                        </div>
                        <div>
                          <dt>{t("category")}</dt>
                          <dd>{categoryLabel(category, t)}</dd>
                        </div>
                        <div className="onboarding-review-wide">
                          <dt>{t("address")}</dt>
                          <dd>{t("compakiAppM")}{slug}</dd>
                        </div>
                        {description.trim() && (
                          <div className="onboarding-review-wide">
                            <dt>{t("introduction")}</dt>
                            <dd>{description}</dd>
                          </div>
                        )}
                      </dl>
                    </ReviewSection>
                    <ReviewSection
                      title={t("howEverySaleIsShared")}
                      onEdit={() => edit(1)}
                    >
                      <SaleBreakdown splits={splits} />
                      <p className="onboarding-field-hint">
                        {t("noExtraFeeIsAddedForBuyers")}</p>
                    </ReviewSection>
                    {regenerative ? (
                      <ReviewSection
                        title={t("yourCommunityPurpose")}
                        onEdit={() => edit(2)}
                      >
                        <dl>
                          <div className="onboarding-review-wide">
                            <dt>{t("howItWorks")}</dt>
                            <dd>{modelLabel}</dd>
                          </div>
                          <div className="onboarding-review-wide">
                            <dt>{t("whatPurchasesMakePossible")}</dt>
                            <dd>{community.communityPurpose}</dd>
                          </div>
                          <div className="onboarding-review-wide">
                            <dt>{t("whoBenefits")}</dt>
                            <dd>{community.communityBeneficiaries}</dd>
                          </div>
                          {community.communityDistribution && (
                            <div className="onboarding-review-wide">
                              <dt>{t("howFundsAreUsedShared")}</dt>
                              <dd>{community.communityDistribution}</dd>
                            </div>
                          )}
                          {mode === "rewards" && (
                            <>
                              <div>
                                <dt>{t("rewardsAvailable")}</dt>
                                <dd>{frequencyLabel(rules.periodSeconds, t)}</dd>
                              </div>
                              <div>
                                <dt>{t("rewardsSplit")}</dt>
                                <dd>
                                  {rules.sellersPercent}{t("sellers3")}{" "}
                                  {100 - rules.sellersPercent}{t("buyers")}</dd>
                              </div>
                            </>
                          )}
                          {mode === "fundraise" && (
                            <>
                              <div>
                                <dt>{t("fundraisingTarget")}</dt>
                                <dd>
                                  $
                                  {Number(rules.goalUsd).toLocaleString(
                                    locale,
                                    { minimumFractionDigits: 2 },
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt>{t("afterEachPayout")}</dt>
                                <dd>{POLICY_TEXT[rules.policy].label}</dd>
                              </div>
                              <div className="onboarding-review-wide">
                                <dt>{t("paymentRecipients")}</dt>
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
                              <dt>{t("communityGoal")}</dt>
                              <dd>
                                $
                                {Number(
                                  community.communityGoalUsd,
                                ).toLocaleString(locale)}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </ReviewSection>
                    ) : (
                      <div className="onboarding-no-community">
                        <Icon name="people" />
                        <p>
                          {t("noCommunityContributionSellersReceive")}{" "}
                          {splits.vendor}{t("andYourMarketplaceReceives")}{" "}
                          {splits.operator}{t("ofEachSale")}</p>
                        <button type="button" onClick={() => edit(1)}>
                          {t("edit")}</button>
                      </div>
                    )}
                    <div className="onboarding-launch-note">
                      <Icon name="shield" />
                      <div>
                        <strong>{t("aFewDetailsAreHereToStay")}</strong>
                        <p>
                          {t("salesPercentages")}{regenerative && mode === "rewards"
                            ? t("andRewardRules")
                            : regenerative && mode === "fundraise"
                              ? t("fundraisingTargetPayoutRulesAndRecipientAccounts")
                              : ""}{" "}
                          {t("areFixedOnceYouLaunchToChangeThemYouLlNeed")}{" "}
                          {regenerative
                            ? t("yourCommunityStoryCanBeEditedLater")
                            : t("checkYourDetailsCarefullyBeforeContinuing")}
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
                        {t("iVeReviewedTheSalesShares")}{regenerative ? t("andCommunityDetails") : ""} {" "}{t("andIMReadyToLaunch")}</span>
                    </label>
                    {(!step1Valid || !purposeValid) && (
                      <p role="alert" className="onboarding-completion-hint">
                        {t("reviewYourMarketplaceAddressAndRequiredDetailsBeforeLaunching")}</p>
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
                        {editingReview ? t("backToReview") : t("back")}
                      </button>
                    ) : (
                      <span className="onboarding-first-step-note">
                        {t("makeItYoursYouCanReviewItAllNext")}</span>
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
                      ? t("launchMyMarketplace")
                      : editingReview
                        ? t("reviewChanges")
                        : t("continue")}
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
                              ? t("done")
                              : launchStates[id] === "active"
                                ? t("inProgress")
                                : t("upNext")}
                          </small>
                        </li>
                      ))}
                    </ol>
                    {launchError && (
                      <div className="onboarding-launch-error" role="alert">
                        <p>{localizedMessage(launchError, t, launchError)}</p>
                        <button
                          type="button"
                          className="button-primary button-small"
                          onClick={() => void launch()}
                        >
                          {t("retrySetup")}</button>
                        <p>{t("weLlResumeWithTheseSameSettings")}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="onboarding-success-address">
                      <Icon name="store" />
                      <div>
                        <span>{t("yourMarketplaceAddress")}</span>
                        <Link href={result.path}>
                          {result.url}
                          <Icon name="arrow" className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                    <div className="onboarding-next-steps">
                      <p className="eyebrow">{t("makeYourFirstDayCount")}</p>
                      <p>
                        <span>01</span>{t("inviteYourFirstSellers")}</p>
                      <p>
                        <span>02</span>{t("addProductsPeopleWillLove")}</p>
                      <p>
                        <span>03</span>{t("shareYourMarketplaceWithYourCommunity")}</p>
                    </div>
                    <Link
                      className="button-primary"
                      href={result.dashboardPath}
                    >
                      {t("goToMyDashboard")}<Icon name="arrow" className="h-4 w-4" />
                    </Link>
                    {result.verifyUrl && (
                      <a
                        className="onboarding-verification"
                        href={result.verifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("viewSetupRecord")}</a>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
          <aside
            className="onboarding-sidebar"
            aria-label={t("marketplacePreviewAndGuidance")}
          >
            <div className="onboarding-preview-label">
              <span className="onboarding-preview-dot" />
              {step === 4 && result
                ? t("yourNewMarketplace")
                : t("yourStorefrontPreview")}
            </div>
            <div className="onboarding-preview">
              <div className="onboarding-preview-art">
                <span>{categoryLabel(category, t)}</span>
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
                <h2>{name.trim() || t("yourMarketplaceHere")}</h2>
                <p>
                  {description.trim() ||
                    t("aPlaceForGoodThingsGreatPeopleAndYourCommunityS")}
                </p>
                <span className="onboarding-preview-url">
                  {t("compakiAppM")}{slug || t("previewSlug")}
                </span>
                {regenerative && (
                  <div className="onboarding-preview-impact">
                    <Icon name="heart" className="h-4 w-4" />
                    <span>
                      {splits.community}{t("ofEachSaleSupports")}{" "}
                      {mode === "rewards"
                        ? t("communityRewards2")
                        : mode === "fundraise"
                          ? t("aSharedGoal")
                          : t("yourCommunity")}
                      .
                    </span>
                  </div>
                )}
              </div>
            </div>
            {step > 0 && step < 4 ? (
              <div className="onboarding-sale-example">
                <p className="eyebrow">{t("aLittleClarity")}</p>
                <h2>
                  {t("one100Sale")}<br />
                  {t("goodForEveryone")}</h2>
                <SaleBreakdown splits={splits} />
                <p>{t("theBuyerPays100HereSWhereItGoes")}</p>
              </div>
            ) : (
              <div className="onboarding-sidebar-note">
                <Icon name="leaf" />
                <h2>
                  {t("aHomeForWhat")}<br />
                  {t("makesYourPeopleSpecial")}</h2>
                <p>
                  {t("startWithTheBasicsInviteYourSellersAndAddYourFirst")}</p>
                <span>
                  <Icon name="check" className="h-3.5 w-3.5" />
                  {t("noProductsNeededToGetStarted")}</span>
              </div>
            )}
            {step === 2 && (
              <div className="onboarding-public-note">
                <Icon name="people" />
                <p>
                  <strong>{t("letYourPurposeDoTheTalking")}</strong>{t("yourStoryContributionRulesAndPaymentRecipientsWillBeVisibleTo")}</p>
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
  const t = useTranslations("ui");

  return (
    <div className="onboarding-field">
      <label htmlFor={id}>
        {label}
        {optional && <span>{t("optional2")}</span>}
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
  const t = useTranslations("ui");
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
          aria-valuetext={t("percentOfEachSale", { value })}
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
  const locale = useLocale();
  const t = useTranslations("ui");

  const parts: { label: string; value: number; color: string }[] = [
    { label: t("sellers"), value: splits.vendor, color: "#456c4e" },
    { label: t("yourMarketplace"), value: splits.operator, color: "#b59a75" },
    ...(splits.community > 0
      ? [{ label: t("community2"), value: splits.community, color: "#9cb375" }]
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
              {formatUsd(part.value, locale)}
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
  const t = useTranslations("ui");

  return (
    <section className="onboarding-review-section">
      <div>
        <h2>{title}</h2>
        <button
          type="button"
          aria-label={t("editValue", { value1: title.toLowerCase() })}
          onClick={onEdit}
        >
          {t("edit")}</button>
      </div>
      {children}
    </section>
  );
}
