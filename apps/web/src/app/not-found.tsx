import { useTranslations } from "next-intl";
import { AppHeader, EmptyState } from "@/components/shell";

export default function NotFound() {
  const t = useTranslations("ui");

  return <div className="min-h-screen bg-background"><AppHeader /><main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-16"><p className="eyebrow mb-5 text-center">{t("aSmallDetour404")}</p><EmptyState icon="search" title={t("letSGetYouBackToTheGoodThings")} description={t("weCouldnTFindThisPageItMayHaveMovedOr")} href="/marketplaces" action={t("exploreMarketplaces")} /></main></div>;
}
