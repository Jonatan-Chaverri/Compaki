import { formatUsd } from "@/lib/format";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { MarketArt } from "@/components/market-art";
import { AppHeader } from "@/components/shell";

export default function LandingPage() {
  const t = useTranslations("ui");
  const locale = useLocale();

const collections = [
  { title: t("fromTheFarm"), description: t("coffeeFreshFindsEverydayGoodness"), variant: "coffee" as const, category: "Coffee & agriculture" },
  { title: t("madeWithCare"), description: t("handcraftedPiecesWithAStoryToTell"), variant: "craft" as const, category: "Crafts" },
  { title: t("rootedInCommunity"), description: t("discoverMoreFromIndependentSellers"), variant: "grow" as const, category: "Other" },
];
const benefits: { icon: IconName; title: string; text: string }[] = [
  { icon: "store", title: t("realPeopleThoughtfulProducts"), text: t("discoverIndependentMakersAndGrowers") },
  { icon: "leaf", title: t("smallPurchasesSharedImpact"), text: t("helpCommunitiesGrowWithEveryOrder") },
  { icon: "shield", title: t("seeWhereYourMoneyGoes"), text: t("aClearBreakdownWithEveryPurchase") },
];

  return <div className="landing">
    <AppHeader right={<Link href="/onboarding" className="button-primary button-small">{t("startAMarketplace")}<Icon name="arrow" className="h-3.5 w-3.5" /></Link>} />
    <main id="main-content">
      <section className="landing-hero">
        <div>
          <span className="hero-tag"><Icon name="leaf" className="h-3.5 w-3.5" /> {" "}{t("aLittleMoreLocalALotMoreConnected")}</span>
          <h1>{t("goodThings")}<br />{t("greatPeople")}<br /><em>{t("growingTogether")}</em></h1>
          <p className="hero-description">{t("discoverProductsWithAStorySupportThePeopleBehindThemAnd")}</p>
          <div className="hero-buttons"><Link href="/marketplaces" className="button-primary">{t("exploreMarketplaces")}<Icon name="arrow" className="h-4 w-4" /></Link><Link href="/onboarding" className="button-secondary">{t("startYourOwn")}</Link></div>
          <p className="hero-reassurance"><Icon name="check" className="h-3 w-3" /> {" "}{t("oneSimpleAccountNoCryptoExperienceNeeded")}</p>
        </div>
        <div className="hero-scene">
          <MarketArt />
          <p className="scene-label">{t("aBasketFullOfBetter")}</p>
          <div className="floating-receipt">
            <div className="receipt-top"><span><Icon name="check" className="h-4 w-4" /></span><div><strong>{t("aPurchaseWithPurpose")}</strong><p>{t("example4000Order")}</p></div></div>
            <div className="receipt-line"><span>{t("toTheMaker")}</span><strong>{formatUsd(36.00, locale)}</strong></div>
            <div className="receipt-line"><span>{t("toTheMarketplace")}</span><strong>{formatUsd(3.20, locale)}</strong></div>
            <div className="receipt-line"><span>{t("toTheCommunity2")}</span><strong>{formatUsd(0.80, locale)} ♡</strong></div>
          </div>
          <span className="floating-impact"><Icon name="leaf" className="h-4 w-4" /> {" "}{t("aLittleBackABetterFuture")}</span>
        </div>
      </section>
      <section className="benefit-strip" aria-label={t("whyShopWithCompaki")}><div className="benefit-inner">{benefits.map(b => <div className="benefit-item" key={b.title}><span className="benefit-icon"><Icon name={b.icon} className="h-5 w-5" /></span><div><strong>{b.title}</strong><p>{b.text}</p></div></div>)}</div></section>
      <section className="landing-section">
        <div className="section-heading-row"><div><p className="eyebrow">{t("findYourKindOfGood")}</p><h2 className="section-title">{t("aWorldOfSmallDiscoveries")}</h2></div><Link href="/marketplaces" className="text-link">{t("exploreAllMarketplaces")}<Icon name="arrow" className="h-4 w-4" /></Link></div>
        <div className="collection-grid">{collections.map(c => <Link href={`/marketplaces?category=${encodeURIComponent(c.category)}`} key={c.title} className="collection-card"><div className="collection-art"><MarketArt variant={c.variant} /></div><div className="collection-body"><div><h3>{c.title}</h3><p>{c.description}</p></div><span className="circle-arrow"><Icon name="arrow" className="h-4 w-4" /></span></div></Link>)}</div>
      </section>
      <section id="how-it-works" className="how-section"><div className="landing-section">
        <div className="how-header"><p className="eyebrow">{t("goodForYouGoodForYourCommunity")}</p><h2 className="section-title">{t("simpleToUseMeaningfulByNature")}</h2><p className="section-copy">{t("shoppingWithPurposeShouldFeelAsNaturalAsShopping")}</p></div>
        <div className="how-grid">
          <div><span className="step-number">{t("01Discover")}</span><h3>{t("findACommunityYouLove")}</h3><p>{t("exploreMarketplacesBroughtTogetherBySharedPlacesPassionsAndPeopleMeet")}</p></div>
          <div><span className="step-number">{t("02Shop")}</span><h3>{t("chooseSomethingThatMatters")}</h3><p>{t("addYourFavoritesToYourCartAndCheckOutWithYour")}</p></div>
          <div><span className="step-number">{t("03Grow")}</span><h3>{t("seeTheGoodYourPurchaseDoes")}</h3><p>{t("sellersReceiveTheirShareAutomaticallyWhenAMarketplaceSupportsACommunity")}</p></div>
        </div>
      </div></section>
      <section id="community" className="landing-section impact-section">
        <div className="impact-example"><div className="impact-example-inner"><p className="eyebrow mb-3">{t("aLittleTransparencyGoesALongWay")}</p><h3>{t("onePurchaseSharedGood")}</h3><p className="mt-2 mb-3 text-xs text-slate-400">{t("anExampleOfA40Order")}</p><div className="split-row"><span><Icon name="store" className="h-4 w-4" /></span>{t("theMaker")}{" "}<strong>{formatUsd(36.00, locale)}</strong></div><div className="split-row"><span><Icon name="people" className="h-4 w-4" /></span>{t("theMarketplace")}{" "}<strong>{formatUsd(3.20, locale)}</strong></div><div className="split-row"><span><Icon name="leaf" className="h-4 w-4" /></span>{t("theCommunity")}{" "}<strong>{formatUsd(0.80, locale)}</strong></div><div className="mt-5 flex h-2 gap-1 overflow-hidden rounded-full"><span className="w-[90%] rounded-full bg-navy-900" /><span className="w-[8%] rounded-full bg-[#d2ac7d]" /><span className="w-[2%] rounded-full bg-[#92ab6c]" /></div></div><p className="impact-note">{t("eachMarketplaceChoosesItsOwnPercentages")}</p></div>
        <div className="impact-copy"><p className="eyebrow">{t("commerceWithASenseOfCommunity")}</p><h2 className="section-title">{t("whenYourCommunityWins")}<br />{t("everyoneGrows")}</h2><p className="section-copy">{t("aSchoolProjectANeighborhoodInitiativeThePeopleWhoMakeIt")}</p><Link href="/onboarding" className="text-link">{t("buildSomethingGoodTogether")}<Icon name="arrow" className="h-4 w-4" /></Link></div>
      </section>
      <section className="landing-cta"><div><h2>{t("yourPeopleYourMarketplace")}</h2><p>{t("bringYourSellersTogetherShareYourStoryAndStartGrowingYour")}</p></div><Link href="/onboarding" className="button-primary">{t("createYourMarketplace")}<Icon name="arrow" className="h-4 w-4" /></Link></section>
    </main>
  </div>;
}
