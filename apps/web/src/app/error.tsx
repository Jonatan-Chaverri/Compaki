"use client";
import { useTranslations } from "next-intl";

import Link from "next/link";
import { AppHeader, EmptyState } from "@/components/shell";

export default function ErrorPage({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const t = useTranslations("ui");

  return <div className="min-h-screen bg-background"><AppHeader /><main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-16"><div role="alert"><EmptyState icon="store" title={t("aLittlePauseWeLlBeRightBack")} description={t("weCouldnTLoadThisPageRightNowTryAgainIn")} /></div><div className="mt-6 flex flex-wrap justify-center gap-3"><button onClick={unstable_retry} className="button-primary">{t("tryAgain")}</button><Link href="/" className="button-secondary">{t("backToHome")}</Link></div></main></div>;
}
