"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { sellerEarnings, type SellerTerms } from "@/lib/seller-earnings";
import { Icon } from "./icon";
import styles from "./seller-earnings.module.css";

type Result = { key: string; terms: SellerTerms | null };

export function SellerEarnings({ marketplaceSlug, price }: { marketplaceSlug: string; price: string }) {
  const t = useTranslations("ui");
  const locale = useLocale();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${marketplaceSlug}:${attempt}`;
  useEffect(() => {
    if (!marketplaceSlug) return;
    const controller = new AbortController();
    fetch(`/api/me/seller-terms?marketplace=${encodeURIComponent(marketplaceSlug)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error();
        const terms = await response.json() as SellerTerms;
        if (terms.marketplace.slug !== marketplaceSlug || !sellerEarnings("1", terms)) throw new Error();
        if (!controller.signal.aborted) setResult({ key, terms });
      })
      .catch(() => { if (!controller.signal.aborted) setResult({ key, terms: null }); });
    return () => controller.abort();
  }, [marketplaceSlug, key]);
  const current = result?.key === key ? result : null;
  const earnings = current?.terms ? sellerEarnings(price, current.terms) : null;
  // Small positive earnings must not display as zero.
  const money = (amount: number) => amount.toLocaleString(locale, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: amount > 0 && amount < .01 ? 7 : 2 });
  return <section className={styles.preview} aria-label={t("sellerEarningsTitle")}>
    <div className={styles.summary} aria-live="polite" aria-atomic="true">
      <div><span className={styles.label}>{t("sellerEarningsTitle")}</span>
        <strong className={styles.amount}>{earnings ? money(earnings.vendorUsd) : "—"}</strong>
      </div>
      {earnings && <span className={styles.percent}>{t("sellerEarningsPercent", { percent: earnings.vendorPercent.toLocaleString(locale, { maximumFractionDigits: 2 }) })}</span>}
    </div>
    {!marketplaceSlug ? <p className={styles.hint}>{t("sellerEarningsChooseMarket")}</p>
      : !current ? <p className={styles.hint}>{t("sellerEarningsLoading")}</p>
      : !current.terms ? <p className={styles.hint}>{t("sellerEarningsUnavailable")} <button type="button" className={styles.retry} onClick={() => setAttempt(value => value + 1)}>{t("sellerEarningsRetry")}</button></p>
      : !earnings ? <p className={styles.hint}>{t("sellerEarningsEnterPrice")}</p>
      : <>
        <p className={styles.hint}>{t("sellerEarningsNote")}</p>
        <details className={styles.details} key={marketplaceSlug}>
          <summary>{t("sellerEarningsBreakdown")}<Icon name="chevron" className="h-3.5 w-3.5" /></summary>
          <dl>
            <div><dt>{t("sellerEarningsSalePrice")}</dt><dd>{money(earnings.priceUsd)}</dd></div>
            <div><dt>{t("sellerEarningsMarketplace")}</dt><dd>{money(earnings.operatorUsd)}</dd></div>
            <div><dt>{t("sellerEarningsCommunity")}</dt><dd>{money(earnings.communityUsd)}</dd></div>
            <div><dt>{t("sellerEarningsPlatform", { percent: current.terms.platformBps / 100 })}</dt><dd>{money(earnings.platformUsd)}</dd></div>
            <div className={styles.total}><dt>{t("sellerEarningsYourShare")}</dt><dd>{money(earnings.vendorUsd)}</dd></div>
          </dl>
          <Link href={`/m/${marketplaceSlug}/community`} target="_blank" rel="noopener noreferrer" className={styles.rules}>{t("sellerEarningsRules")}<Icon name="arrow" className="h-3 w-3" /></Link>
        </details>
      </>}
  </section>;
}
