"use client";
import type { UiTranslator } from "@/i18n/types";
import { useTranslations } from "next-intl";

// The on-chain rules of a marketplace's community share, chosen once in the
// wizard: where it goes (mode) — for classic, the account that receives it
// with every sale — and for rewards / fundraising the rules the contract
// enforces from then on.

import { InfoHint } from "./info-hint";
import { useId } from "react";

import { goalValid } from "@/lib/community";
import {
  getPolicyText,
  getRewardsFrequencies,
  type CommunityMode,
  type GoalPolicy,
} from "@/lib/rewards";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500";
const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;
const MAX_RECIPIENTS = 20;

export interface RecipientDraft {
  label: string;
  address: string;
  percent: string;
}

export interface CommunityRules {
  mode: CommunityMode;
  periodSeconds: number;
  /** Whole percent of each period's pool for sellers; buyers get the rest. */
  sellersPercent: number;
  goalUsd: string;
  policy: GoalPolicy;
  recipients: RecipientDraft[];
  /** classic: the account that receives the community share, and its public name */
  fundName: string;
  fundAddress: string;
}

export const defaultCommunityRules: CommunityRules = {
  mode: "classic",
  periodSeconds: 30 * 86400,
  sellersPercent: 50,
  goalUsd: "",
  policy: "new-round",
  recipients: [{ label: "", address: "", percent: "100" }],
  fundName: "",
  fundAddress: "",
};

/** Percent text → basis points (two decimals allowed). */
function bpsOf(percent: string): number {
  return Math.round(Number(percent) * 100);
}

/** First problem with the rules, or null when they can be launched. */
export function communityRulesError(rules: CommunityRules, t: UiTranslator): string | null {
  if (rules.mode === "classic") {
    if (rules.fundName.trim().length < 2 || rules.fundName.trim().length > 80)
      return t("rulesFundNameError");
    if (!STELLAR_ADDRESS.test(rules.fundAddress.trim()))
      return t("rulesFundAddressError");
    return null;
  }
  if (rules.mode !== "fundraise") return null;
  if (!goalValid(rules.goalUsd))
    return t("rulesTargetError");
  if (rules.recipients.length === 0)
    return t("rulesRecipientError");
  for (const r of rules.recipients) {
    if (r.label.trim().length < 2 || r.label.trim().length > 80)
      return t("rulesNameError");
    if (!STELLAR_ADDRESS.test(r.address.trim()))
      return t("rulesAddressError");
    const bps = bpsOf(r.percent);
    if (!Number.isFinite(bps) || bps < 1 || bps > 10_000)
      return t("rulesShareError");
  }
  if (
    new Set(rules.recipients.map((r) => r.address.trim())).size !==
    rules.recipients.length
  ) {
    return t("rulesDuplicateError");
  }
  const total = rules.recipients.reduce((sum, r) => sum + bpsOf(r.percent), 0);
  if (total !== 10_000)
    return t("rulesTotalError", { total: total / 100 });
  return null;
}

/** The launch payload fields for these rules. */
export function communityRulesSubmission(rules: CommunityRules) {
  return {
    communityMode: rules.mode,
    ...(rules.mode === "classic"
      ? {
          communityFundName: rules.fundName.trim(),
          communityFundAddress: rules.fundAddress.trim(),
        }
      : {}),
    ...(rules.mode === "rewards"
      ? {
          rewardsPeriodSeconds: rules.periodSeconds,
          rewardsVendorPoolBps: rules.sellersPercent * 100,
        }
      : {}),
    ...(rules.mode === "fundraise"
      ? {
          communityGoalUsd: Number(rules.goalUsd),
          fundraisePolicy: rules.policy,
          fundraiseRecipients: rules.recipients.map((r) => ({
            label: r.label.trim(),
            address: r.address.trim(),
            shareBps: bpsOf(r.percent),
          })),
        }
      : {}),
  };
}

export function CommunityRulesFields({ value, onChange, communityPercent }: {
  value: CommunityRules;
  onChange: (value: CommunityRules) => void;
  communityPercent: number;
}) {
  const t = useTranslations("ui");
  const policies = getPolicyText(t);
  const frequencies = getRewardsFrequencies(t);
  const id = useId();
  const set = (patch: Partial<CommunityRules>) => onChange({ ...value, ...patch });
  const setRecipient = (i: number, patch: Partial<RecipientDraft>) => set({
    recipients: value.recipients.map((recipient, j) => j === i ? { ...recipient, ...patch } : recipient),
  });
  const error = communityRulesError(value, t);
  const modes: { mode: CommunityMode; title: string; detail: string }[] = [
    { mode: "classic", title: t("purposeModeInitiative"), detail: t("contributionsGoToASharedFundWithEachSaleYouManage") },
    { mode: "rewards", title: t("purposeModeRewards"), detail: t("contributionsBuildARewardsFundAtTheEndOfEachPeriod") },
    { mode: "fundraise", title: t("aFundraisingGoal"), detail: t("saveContributionsTowardASpecificGoalOnceItIsReachedRelease") },
  ];

  return <div className="community-rules-fields space-y-5">
    <fieldset>
      <legend className="purpose-section-title">{t("whereDoesTheCommunityShareGo")}
        <InfoHint label={t("whereDoesTheCommunityShareGo")}>{t("theseRulesAreFixedAtLaunchFundsCanOnlyBeCollected")}</InfoHint>
      </legend>
      <div className="grid gap-2">
        {modes.map(option => <div key={option.mode} className="community-mode-option purpose-choice-option">
          <label>
            <input type="radio" name={`${id}-mode`} checked={value.mode === option.mode} onChange={() => set({ mode: option.mode })} />
            <span>{option.title}</span>
          </label>
          <InfoHint label={option.title}>{option.detail}</InfoHint>
        </div>)}
      </div>
    </fieldset>

    {value.mode === "classic" && <div className="purpose-rules-panel">
      <fieldset>
        <legend className="purpose-section-title">{t("communityFundWalletTitle")}<InfoHint label={t("communityFundWalletTitle")}>{t("communityFundWalletHint")}</InfoHint></legend>
        <div className="community-recipient-row grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[1fr_2fr]">
          <label className="community-recipient-name"><span>{t("publicName")}</span><input value={value.fundName} maxLength={80} onChange={e => set({ fundName: e.target.value })} placeholder={t("escuelaVerde")} className={inputClass} /></label>
          <label className="community-recipient-address"><span>{t("paymentAccountAddress")}</span><input value={value.fundAddress} onChange={e => set({ fundAddress: e.target.value })} placeholder={t("paymentAccountAddressG")} className={`${inputClass} font-mono text-xs`} /></label>
        </div>
      </fieldset>
      {error && <p className="text-xs text-amber-700">{error}</p>}
    </div>}

    {value.mode === "rewards" && <div className="purpose-rules-panel">
      <div>
        <div className="purpose-field-title"><label htmlFor={`${id}-period`}>{t("purposeFrequencyLabel")}</label><InfoHint label={t("purposeFrequencyLabel")}>{t("periodsStartAtLaunchAndFollowOneAnotherAutomaticallyWhenOne")}</InfoHint></div>
        <select id={`${id}-period`} value={value.periodSeconds} onChange={e => set({ periodSeconds: Number(e.target.value) })} className={inputClass}>
          {frequencies.map(frequency => <option key={frequency.seconds} value={frequency.seconds}>{frequency.label}</option>)}
        </select>
      </div>
      <div>
        <div className="purpose-field-title"><label htmlFor={`${id}-pools`}>{t("splitBetweenSellersAndBuyers")}</label><InfoHint label={t("splitBetweenSellersAndBuyers")}>
          {t("eachSellerGetsTheirPartOfTheSellersShareByHow")}{communityPercent > 0 && <> {t("forEvery100Sold")}{((communityPercent * value.sellersPercent) / 100).toFixed(2)} {t("goesToSellersAnd")}{((communityPercent * (100 - value.sellersPercent)) / 100).toFixed(2)} {t("toBuyers")}</>}
        </InfoHint></div>
        <input id={`${id}-pools`} type="range" min={0} max={100} step={5} value={value.sellersPercent} onChange={e => set({ sellersPercent: Number(e.target.value) })} className="w-full accent-emerald-600" />
        <div className="purpose-split-values"><span>{t("sellers")} <strong>{value.sellersPercent}%</strong></span><span>{t("buyers2")} <strong>{100 - value.sellersPercent}%</strong></span></div>
      </div>
    </div>}

    {value.mode === "fundraise" && <div className="purpose-rules-panel">
      <div>
        <div className="purpose-field-title"><label htmlFor={`${id}-goal`}>{t("fundraisingTargetUsd")}</label></div>
        <input id={`${id}-goal`} type="number" min="0.01" max="1000000000" step="0.01" value={value.goalUsd} onChange={e => set({ goalUsd: e.target.value })} placeholder={t("eG2500")} className={inputClass} />
      </div>
      <fieldset>
        <legend className="purpose-section-title">{t("whoReceivesTheFunds2")}<InfoHint label={t("whoReceivesTheFunds2")}>{t("recipientsPublicNamesPaymentAddressesAndSharesAppearOnYourCommunity")}</InfoHint></legend>
        <div className="space-y-2">
          {value.recipients.map((recipient, i) => <div key={i} className="community-recipient-row grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[1fr_2fr_5rem_auto]">
            <label className="community-recipient-name"><span>{t("publicName")}</span><input aria-label={t("recipientValueName", { value1: i + 1 })} value={recipient.label} maxLength={80} onChange={e => setRecipient(i, { label: e.target.value })} placeholder={t("escuelaVerde")} className={inputClass} /></label>
            <label className="community-recipient-address"><span>{t("paymentAccountAddress")}</span><input aria-label={t("recipientValuePaymentAddress", { value1: i + 1 })} value={recipient.address} onChange={e => setRecipient(i, { address: e.target.value })} placeholder={t("paymentAccountAddressG")} className={`${inputClass} font-mono text-xs`} /></label>
            <label className="community-recipient-share"><span>{t("share")}</span><div className="relative"><input aria-label={t("recipientValueShare", { value1: i + 1 })} type="number" min="0.01" max="100" step="0.01" value={recipient.percent} onChange={e => setRecipient(i, { percent: e.target.value })} className={`${inputClass} pr-6`} /><span className="pointer-events-none absolute top-2.5 right-2 text-sm text-slate-400">%</span></div></label>
            <button type="button" onClick={() => set({ recipients: value.recipients.filter((_, j) => j !== i) })} disabled={value.recipients.length === 1} className="rounded-lg px-2 text-xs text-slate-500 hover:text-red-600 disabled:opacity-30">{t("remove")}</button>
          </div>)}
        </div>
        {value.recipients.length < MAX_RECIPIENTS && <button type="button" onClick={() => set({ recipients: [...value.recipients, { label: "", address: "", percent: "" }] })} className="text-link mt-2 text-sm">{t("addARecipient")}</button>}
      </fieldset>
      <fieldset>
        <legend className="purpose-section-title">{t("whenTheTargetIsReachedAndPaidOut")}</legend>
        <div className="grid gap-2">
          {(Object.keys(policies) as GoalPolicy[]).map(policy => <div key={policy} className="purpose-choice-option purpose-policy-option">
            <label><input type="radio" name={`${id}-policy`} checked={value.policy === policy} onChange={() => set({ policy })} /><span>{policies[policy].label}</span></label>
            <InfoHint label={policies[policy].label}>{policies[policy].detail}</InfoHint>
          </div>)}
        </div>
      </fieldset>
      {error && <p className="text-xs text-amber-700">{error}</p>}
    </div>}
  </div>;
}
