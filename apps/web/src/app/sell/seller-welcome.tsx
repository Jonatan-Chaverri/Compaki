"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icon";
import styles from "./seller-welcome.module.css";

const steps: { icon: IconName; title: string; description: string }[] = [
  { icon: "store", title: "sellerWelcomeMarkets", description: "sellerWelcomeMarketsBody" },
  { icon: "bag", title: "sellerWelcomeProducts", description: "sellerWelcomeProductsBody" },
  { icon: "grid", title: "sellerWelcomeManage", description: "sellerWelcomeManageBody" },
];

export function SellerWelcome({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("ui");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function activate() {
    setBusy(true); setError(false);
    try {
      const response = await fetch("/api/me/seller", { method: "POST" });
      if (response.status === 401) { router.push("/login?next=%2Fsell"); return; }
      if (!response.ok) throw new Error();
      router.replace("/vendor");
      router.refresh();
    } catch { setError(true); setBusy(false); }
  }
  return <main id="main-content" tabIndex={-1} className={styles.page}>
    <div className={styles.intro}>
      <span className={styles.emblem}><Icon name="store" className="h-8 w-8" /></span>
      <p className="eyebrow">{t("wantToBeSeller")}</p>
      <h1>{t("sellerWelcomeTitle")}</h1>
      <p className={styles.description}>{t("sellerWelcomeDescription")}</p>
    </div>
    <div className={styles.card}>
      <ol className={styles.steps}>{steps.map(step => <li key={step.title}>
        <span className={styles.stepIcon}><Icon name={step.icon} className="h-5 w-5" /></span>
        <div><h2>{t(step.title)}</h2><p>{t(step.description)}</p></div>
      </li>)}</ol>
      <div className={styles.action}>
        {signedIn ? <button type="button" disabled={busy} onClick={() => void activate()} className="button-primary">{t(busy ? "sellerActivating" : "sellerActivate")}<Icon name="arrow" className="h-4 w-4" /></button>
          : <Link href="/login?next=%2Fsell" className="button-primary">{t("signInOrCreateAccount")}<Icon name="arrow" className="h-4 w-4" /></Link>}
        <p>{t("sellerWelcomeNote")}</p>
        {error && <p role="alert" className={styles.error}>{t("sellerActivationFailed")}</p>}
      </div>
    </div>
    <Link href="/marketplaces" className={styles.explore}>{t("exploreMarketplaces")}<Icon name="arrow" className="h-3.5 w-3.5" /></Link>
  </main>;
}
