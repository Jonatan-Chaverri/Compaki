"use client";
import { localizedMessage } from "@/i18n/errors";

import { useTranslations } from "next-intl";

import Link from "next/link";
import { useState } from "react";

const inputClass =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 bg-white";

export function JoinForm({
  slug,
  marketplaceName,
  user,
}: {
  slug: string;
  marketplaceName: string;
  user: { name: string; email: string | null } | null;
}) {
  const t = useTranslations("ui");

  const [sells, setSells] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setState("submitting");
    setError(null);
    try {
      const res = await fetch(`/api/marketplaces/${slug}/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sells }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(localizedMessage(data.error, t, t("registrationFailed")));
      setState("done");
    } catch (err) {
      setError(localizedMessage(err, t, t("registrationFailed")));
      setState("idle");
    }
  };

  if (state === "done") {
    return (
      <div className="py-4 text-center">
        <p className="text-4xl">🎉</p>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
          {t("youReInAddYourFirstProduct")}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {t("yourPaymentAccountIsReadyYourShareOfEachDemoSale")}</p>
        <Link
          href={`/vendor/${slug}`}
          className="mt-6 inline-block rounded-full bg-navy-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-navy-700"
        >
          {t("goToMyProducts")}</Link>
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(`/m/${slug}/join`);
    return (
      <div className="py-2 text-center">
        <p className="text-sm text-slate-600">
          {t("signInOrCreateACompakiAccountFirstYouLlJoin")}{" "}{marketplaceName} {" "}{t("asThatAccount")}</p>
        <div className="mt-5 flex justify-center">
          <Link
            href={`/login?next=${next}`}
            className="rounded-full bg-navy-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-navy-700"
          >
            {t("signInOrCreateAccount")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {t("joiningAs")}{" "}<span className="font-medium text-slate-900">{user.name}</span>
        {user.email && <span className="text-slate-400"> · {user.email}</span>}
      </p>
      <div className="mb-6">
        <label htmlFor="seller-story" className="mb-1.5 block text-sm font-medium text-slate-700">
          {t("whatDoYouSell")}</label>
        <input
          id="seller-story"
          type="text"
          value={sells}
          onChange={(e) => setSells(e.target.value)}
          placeholder={t("handRoastedCoffeeFromMyFamilyFarm")}
          maxLength={200}
          className={inputClass}
          disabled={state === "submitting"}
        />
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
          {localizedMessage(error, t, error)}
        </p>
      )}

      <button
        onClick={() => void submit()}
        disabled={state === "submitting"}
        className="w-full rounded-full bg-navy-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state === "submitting" ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            {t("settingUpYourPaymentAccount15s")}</span>
        ) : (
          t("joinValue", { value1: marketplaceName })
        )}
      </button>
      <p className="mt-3 text-center text-xs text-slate-400">
        {t("weSetUpYourDemoPaymentAccountForYouNoBank")}</p>
    </div>
  );
}
