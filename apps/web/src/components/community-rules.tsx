"use client";

// The on-chain rules of a marketplace's community share, chosen once in the
// wizard: where it goes (mode), and for rewards / fundraising the rules the
// contract enforces from then on.

import { useId } from "react";

import { goalValid } from "@/lib/community";
import {
  POLICY_TEXT,
  REWARDS_FREQUENCIES,
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
}

export const defaultCommunityRules: CommunityRules = {
  mode: "classic",
  periodSeconds: REWARDS_FREQUENCIES[0].seconds,
  sellersPercent: 50,
  goalUsd: "",
  policy: "new-round",
  recipients: [{ label: "", address: "", percent: "100" }],
};

/** Percent text → basis points (two decimals allowed). */
function bpsOf(percent: string): number {
  return Math.round(Number(percent) * 100);
}

/** First problem with the rules, or null when they can be launched. */
export function communityRulesError(rules: CommunityRules): string | null {
  if (rules.mode !== "fundraise") return null;
  if (!goalValid(rules.goalUsd)) return "Set a fundraising target (a positive amount).";
  if (rules.recipients.length === 0) return "Add at least one wallet.";
  for (const r of rules.recipients) {
    if (r.label.trim().length < 2) return "Give every wallet a public name.";
    if (!STELLAR_ADDRESS.test(r.address.trim())) return "Every wallet needs a valid Stellar address (G…).";
    const bps = bpsOf(r.percent);
    if (!Number.isFinite(bps) || bps < 1 || bps > 10_000) return "Every wallet needs a share above 0%.";
  }
  if (new Set(rules.recipients.map((r) => r.address.trim())).size !== rules.recipients.length) {
    return "Each wallet can only appear once.";
  }
  const total = rules.recipients.reduce((sum, r) => sum + bpsOf(r.percent), 0);
  if (total !== 10_000) return `Wallet shares must add up to 100% (now ${total / 100}%).`;
  return null;
}

/** The launch payload fields for these rules. */
export function communityRulesSubmission(rules: CommunityRules) {
  return {
    communityMode: rules.mode,
    ...(rules.mode === "rewards"
      ? { rewardsPeriodSeconds: rules.periodSeconds, rewardsVendorPoolBps: rules.sellersPercent * 100 }
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

const MODES: { mode: CommunityMode; title: string; detail: string }[] = [
  {
    mode: "classic",
    title: "A community fund account",
    detail: "Each sale sends the community share to a fund account. The organizer decides how it is used.",
  },
  {
    mode: "rewards",
    title: "Rewards for sellers and buyers",
    detail: "The contract saves the community share and, every period, shares it between that period's sellers and buyers, by what each one sold and bought.",
  },
  {
    mode: "fundraise",
    title: "A fundraising goal",
    detail: "The contract saves the community share until it reaches a target, then pays it to the wallets you choose.",
  },
];

export function CommunityRulesFields({
  value,
  onChange,
  communityPercent,
}: {
  value: CommunityRules;
  onChange: (value: CommunityRules) => void;
  communityPercent: number;
}) {
  const id = useId();
  const set = (patch: Partial<CommunityRules>) => onChange({ ...value, ...patch });
  const setRecipient = (i: number, patch: Partial<RecipientDraft>) =>
    set({ recipients: value.recipients.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const error = communityRulesError(value);
  const example = communityPercent; // community dollars per $100 sale

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-900">Where does the community share go?</legend>
        <div className="grid gap-2">
          {MODES.map((m) => (
            <label
              key={m.mode}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                value.mode === m.mode ? "border-emerald-500 bg-emerald-50/60" : "border-slate-200 bg-white"
              }`}
            >
              <input
                type="radio"
                name={`${id}-mode`}
                checked={value.mode === m.mode}
                onChange={() => set({ mode: m.mode })}
                className="mt-1 accent-emerald-600"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">{m.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">{m.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {value.mode === "rewards" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label htmlFor={`${id}-period`} className="mb-1.5 block text-sm font-medium text-slate-700">
              How often are rewards shared?
            </label>
            <select
              id={`${id}-period`}
              value={value.periodSeconds}
              onChange={(e) => set({ periodSeconds: Number(e.target.value) })}
              className={inputClass}
            >
              {REWARDS_FREQUENCIES.map((f) => (
                <option key={f.seconds} value={f.seconds}>
                  {f.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Periods start at launch and follow one another automatically. When one ends, everyone who sold or
              bought in it can claim their part.
            </p>
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <label htmlFor={`${id}-pools`} className="font-medium text-slate-700">
                Split between sellers and buyers
              </label>
              <span className="tabular-nums text-slate-900">
                Sellers <strong>{value.sellersPercent}%</strong> · Buyers <strong>{100 - value.sellersPercent}%</strong>
              </span>
            </div>
            <input
              id={`${id}-pools`}
              type="range"
              min={0}
              max={100}
              step={5}
              value={value.sellersPercent}
              onChange={(e) => set({ sellersPercent: Number(e.target.value) })}
              className="w-full accent-emerald-600"
            />
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Each seller gets their part of the sellers&apos; share by how much they sold in the period; each
              buyer by how much they bought.
              {example > 0 && (
                <>
                  {" "}
                  For every $100 sold, ${((example * value.sellersPercent) / 100).toFixed(2)} goes to sellers and $
                  {((example * (100 - value.sellersPercent)) / 100).toFixed(2)} to buyers.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {value.mode === "fundraise" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label htmlFor={`${id}-goal`} className="mb-1.5 block text-sm font-medium text-slate-700">
              Fundraising target (USD)
            </label>
            <input
              id={`${id}-goal`}
              type="number"
              min="0.01"
              step="0.01"
              value={value.goalUsd}
              onChange={(e) => set({ goalUsd: e.target.value })}
              placeholder="e.g. 2500"
              className={inputClass}
            />
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Wallets that receive the funds</legend>
            <p className="mb-2 text-xs text-slate-500">
              Public: anyone can see these wallets and their shares on your community page. Each wallet must
              accept the demo dollar, so ask recipients to sign in to Compaki once with it.
            </p>
            <div className="space-y-2">
              {value.recipients.map((r, i) => (
                <div key={i} className="grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[1fr_2fr_5rem_auto]">
                  <input
                    aria-label={`Recipient ${i + 1} name`}
                    value={r.label}
                    onChange={(e) => setRecipient(i, { label: e.target.value })}
                    placeholder="Escuela Verde"
                    className={inputClass}
                  />
                  <input
                    aria-label={`Recipient ${i + 1} Stellar address`}
                    value={r.address}
                    onChange={(e) => setRecipient(i, { address: e.target.value })}
                    placeholder="G…"
                    className={`${inputClass} font-mono text-xs`}
                  />
                  <div className="relative">
                    <input
                      aria-label={`Recipient ${i + 1} share (%)`}
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      value={r.percent}
                      onChange={(e) => setRecipient(i, { percent: e.target.value })}
                      className={`${inputClass} pr-6`}
                    />
                    <span className="pointer-events-none absolute top-2.5 right-2 text-sm text-slate-400">%</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => set({ recipients: value.recipients.filter((_, j) => j !== i) })}
                    disabled={value.recipients.length === 1}
                    className="rounded-lg px-2 text-xs text-slate-500 hover:text-red-600 disabled:opacity-30"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            {value.recipients.length < MAX_RECIPIENTS && (
              <button
                type="button"
                onClick={() => set({ recipients: [...value.recipients, { label: "", address: "", percent: "" }] })}
                className="text-link mt-2 text-sm"
              >
                + Add a wallet
              </button>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">When the target is reached and paid out…</legend>
            <div className="grid gap-2">
              {(Object.keys(POLICY_TEXT) as GoalPolicy[]).map((policy) => (
                <label
                  key={policy}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                    value.policy === policy ? "border-emerald-500 bg-emerald-50/60" : "border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${id}-policy`}
                    checked={value.policy === policy}
                    onChange={() => set({ policy })}
                    className="mt-1 accent-emerald-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">{POLICY_TEXT[policy].label}</span>
                    <span className="block text-xs text-slate-600">{POLICY_TEXT[policy].detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p className="text-xs text-amber-700">{error}</p>}
        </div>
      )}

      {value.mode !== "classic" && (
        <p className="text-xs leading-relaxed text-slate-500">
          These rules are written into the contract at launch and can&apos;t be changed. Nobody, including you
          or Compaki, can withdraw the saved funds.
        </p>
      )}
    </div>
  );
}
