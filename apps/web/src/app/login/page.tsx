import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { MarketArt } from "@/components/market-art";
import { DemoNotice, Logo } from "@/components/shell";
import { LanguageMenu } from "@/components/language-menu";
import { ThemeMenu } from "@/components/theme-menu";
import { SignIn } from "./sign-in";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getTranslations("ui");
  return { title: t("loginTitle") };
}

export default function LoginPage() {
  const t = useTranslations("ui");

  return (
    <div className="login-page">
      <DemoNotice />
      <header className="login-header">
        <Link href="/" aria-label={t("compakiHome")}><Logo /></Link>
        <div className="login-header-actions"><Link href="/marketplaces" className="login-browse"><span>{t("justExploring")}</span> {" "}{t("browseMarketplaces")}{" "}<Icon name="arrow" className="h-4 w-4" /></Link><LanguageMenu /><ThemeMenu /></div>
      </header>
      <main id="main-content" tabIndex={-1} className="login-layout">
        <section className="login-story" aria-labelledby="login-story-title">
          <div className="login-story-top"><span className="login-story-label"><Icon name="leaf" className="h-3.5 w-3.5" /> {" "}{t("aPlaceForYourKindOfGood")}</span><span className="login-story-dot" /></div>
          <h2 id="login-story-title">{t("goodThingsStart")}<br />{t("with")}{" "}<em>{t("yourPeople")}</em></h2>
          <p>{t("findSomethingYouLoveMeetThePeopleWhoMadeItGrow")}</p>
          <div className="login-illustration"><MarketArt /><div className="login-impact-note"><span><Icon name="heart" className="h-4 w-4" /></span><div><strong>{t("moreThanAMarketplace")}</strong><p>{t("aLittleConnectionASharedFuture")}</p></div><Icon name="spark" className="h-4 w-4" /></div></div>
          <div className="login-story-bottom"><span><Icon name="bag" className="h-4 w-4" /> {" "}{t("shopWithPurpose")}</span><span><Icon name="people" className="h-4 w-4" /> {" "}{t("growTogether")}</span></div>
        </section>
        <div className="login-access">
          <Suspense fallback={<div className="login-card login-card-loading" role="status"><span className="login-card-symbol"><Icon name="leaf" className="h-5 w-5" /></span><p>{t("loginLoading")}</p></div>}>
            <SignIn />
          </Suspense>
          <p className="login-reassurance"><Icon name="shield" className="h-3.5 w-3.5" /> {" "}{t("oneAccountForAllYourCommunities")}</p>
        </div>
      </main>
    </div>
  );
}
