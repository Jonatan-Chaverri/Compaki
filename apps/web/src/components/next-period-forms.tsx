"use client";

// Operator forms for what comes next: the next rewards period's rules (pool
// split and frequency) and the next fundraising round's target. Saving
// schedules them in the contract, which applies them at the next
// distribution or payout — the running period or round never changes. An
// operator with their own wallet approves the change in it.

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { useCompakiWallet } from "@/components/cavos-provider";
import { localizedMessage } from "@/i18n/errors";
import { followSignatures, readResult } from "@/lib/wallet-signing";
import { formatAmount, formatTs, frequencyLabel, getPolicyText, getRewardsFrequencies, type FundraiseView, type RewardsView } from "@/lib/rewards";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500";

/** PUTs the choice; the operator's own wallet signs it when the API asks (202). */
async function put(
  url: string,
  body: unknown,
  signXdr: (xdr: string, address: string) => Promise<string>,
  onApprove: () => void,
): Promise<void> {
  const first = await readResult(
    await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const result = await followSignatures(first, signXdr, onApprove);
  if (result.status !== 200) throw new Error(result.body.error ?? `Request failed (${result.status})`);
}

export function NextRulesForm({
  slug,
  rewards,
  onSaved,
}: {
  slug: string;
  rewards: RewardsView;
  onSaved: () => void;
}) {
  const t = useTranslations("ui");
  const locale = useLocale();
  const frequencies = getRewardsFrequencies(t);
  const wallet = useCompakiWallet();
  const pending = rewards.nextRules;
  const [sellers, setSellers] = useState(() => Math.round((pending?.vendorPoolBps ?? rewards.vendorPoolBps ?? 5_000) / 100));
  const [periodSeconds, setPeriodSeconds] = useState(() => pending?.periodSeconds ?? rewards.periodSeconds ?? frequencies[0].seconds);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (body: unknown, done: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await put(`/api/rewards/marketplace/${encodeURIComponent(slug)}/next-rules`, body, wallet.signXdr, () =>
        setMessage(t("approveInYourWallet")),
      );
      setMessage(done);
      onSaved();
    } catch (err) {
      setError(localizedMessage(err, t, t("couldNotSaveTheNextRules")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-medium text-slate-900">{t("nextPeriodTitle")}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {t("nextPeriodHelp", { date: rewards.periodEnd ? formatTs(rewards.periodEnd, locale) : "—" })}
      </p>
      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
        {pending
          ? t("nextPeriodPending", {
              sellers: pending.vendorPoolBps / 100,
              buyers: 100 - pending.vendorPoolBps / 100,
              frequency: frequencyLabel(pending.periodSeconds, t),
            })
          : t("nextPeriodNone")}
      </p>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save({ vendorPoolBps: sellers * 100, periodSeconds }, t("nextRulesSaved"));
        }}
      >
        <label className="text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">{t("howOftenAreRewardsShared")}</span>
          <select value={periodSeconds} onChange={(e) => setPeriodSeconds(Number(e.target.value))} className={inputClass} disabled={busy}>
            {frequencies.map((f) => (
              <option key={f.seconds} value={f.seconds}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1.5 flex justify-between font-medium text-slate-700">
            <span>{t("splitBetweenSellersAndBuyers")}</span>
            <span className="tabular-nums">{t("sellersBuyersPercent", { sellers, buyers: 100 - sellers })}</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={sellers}
            onChange={(e) => setSellers(Number(e.target.value))}
            className="mt-3 w-full accent-emerald-600"
            disabled={busy}
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" disabled={busy} className="button-primary disabled:opacity-40">
            {busy ? t("saving") : t("saveNextRules")}
          </button>
          {pending && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save({ clear: true }, t("nextRulesCleared"))}
              className="button-secondary disabled:opacity-40"
            >
              {t("clearNextRules")}
            </button>
          )}
        </div>
      </form>
      {message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}

export function NextTargetForm({
  slug,
  fundraise,
  onSaved,
}: {
  slug: string;
  fundraise: FundraiseView;
  onSaved: () => void;
}) {
  const t = useTranslations("ui");
  const locale = useLocale();
  const wallet = useCompakiWallet();
  const pending = fundraise.nextTargetUsd;
  const [target, setTarget] = useState(() => (pending === null ? "" : String(pending)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const policy = fundraise.policy ? getPolicyText(t)[fundraise.policy].label : null;
  const value = Number(target);
  const valid = target !== "" && Number.isFinite(value) && value >= 0 && Math.abs(value * 100 - Math.round(value * 100)) < 0.00001;

  const save = async (targetUsd: number | null, done: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await put(`/api/rewards/marketplace/${encodeURIComponent(slug)}/fundraise/next-target`, { targetUsd }, wallet.signXdr, () =>
        setMessage(t("approveInYourWallet")),
      );
      setMessage(done);
      if (targetUsd === null) setTarget("");
      onSaved();
    } catch (err) {
      setError(localizedMessage(err, t, t("couldNotSaveTheNextTarget")));
    } finally {
      setBusy(false);
    }
  };

  if (!fundraise.collecting) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-medium text-slate-900">{t("nextRoundTitle")}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{t("nextRoundHelp")}</p>
      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
        {pending === null
          ? t("nextRoundDefault", { policy: policy ?? "—", amount: formatAmount(fundraise.targetUsd ?? 0, locale) })
          : pending === 0
            ? t("nextRoundStop")
            : t("nextRoundPending", { amount: formatAmount(pending, locale) })}
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void save(value, t("nextTargetSaved"));
        }}
      >
        <label className="min-w-48 flex-1 text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">{t("nextTargetUsd")}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={t("nextTargetPlaceholder")}
            className={inputClass}
            disabled={busy}
          />
        </label>
        <button type="submit" disabled={busy || !valid} className="button-primary disabled:opacity-40">
          {busy ? t("saving") : t("saveNextTarget")}
        </button>
        {pending !== null && (
          <button type="button" disabled={busy} onClick={() => void save(null, t("nextTargetCleared"))} className="button-secondary disabled:opacity-40">
            {t("clearNextTarget")}
          </button>
        )}
      </form>
      {target !== "" && !valid && <p className="mt-2 text-xs text-amber-700">{t("nextTargetInvalid")}</p>}
      {message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
