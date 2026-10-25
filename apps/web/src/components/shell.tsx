import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { AppNavigation } from "./app-navigation";
import { Icon } from "./icon";
import { LanguageMenu } from "./language-menu";
import { UserMenu } from "./user-menu";

export function Logo() {
  return <span className="brand-logo"><Image src="/logo.png" alt="" width={36} height={36} priority /><span>compaki<span className="brand-period">.</span></span></span>;
}

export function DemoNotice() {
  const t = useTranslations("ui");

  return <div className="demo-notice"><span className="demo-dot" /><strong>{t("exploreTheDemo")}</strong><span>{t("allPurchasesAndBalancesUseTestFundsNoRealMoney")}</span></div>;
}

export function AppHeader({ right }: { right?: React.ReactNode }) {
  const t = useTranslations("ui");

  return <>
    <DemoNotice />
    <header className="app-header">
      <div className="header-inner">
        <Link href="/" aria-label={t("compakiHome")} className="shrink-0"><Logo /></Link>
        <AppNavigation />
        <div className="header-actions">{right}<LanguageMenu /><UserMenu /></div>
      </div>
    </header>
  </>;
}

export function AppFooter() {
  const t = useTranslations("ui");

  return <footer className="app-footer"><div className="footer-inner">
    <div><Link href="/" aria-label={t("compakiHome")}><Logo /></Link><p>{t("goodThingsHappenWhenWeGrowTogether")}</p></div>
    <nav aria-label={t("footerNavigation")}><Link href="/marketplaces">{t("explore")}</Link><Link href="/onboarding">{t("startAMarketplace")}</Link><Link href="/#how-it-works">{t("howItWorks")}</Link></nav>
    <span className="footer-note">{t("builtForPeoplePoweredByStellar")}<br />© {new Date().getFullYear()} {" "}{t("compakiTestnetDemo")}</span>
  </div></footer>;
}

export function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{children}</div>;
}

export function EmptyState({ title, description, href, action, icon = "bag" }: { title: string; description: string; href?: string; action?: string; icon?: "bag" | "leaf" | "store" | "search" | "shield" }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} className="h-7 w-7" /></span><h2>{title}</h2><p>{description}</p>{href && <Link href={href} className="button-primary">{action}<Icon name="arrow" className="h-4 w-4" /></Link>}</div>;
}

export function ProductVisual({ imageUrl, size = "md" }: { imageUrl: string | null; size?: "sm" | "md" }) {

  const classes = size === "sm" ? "product-visual product-visual-small" : "product-visual";
  if (imageUrl && /^(https?:\/\/|\/)/.test(imageUrl)) {
    // eslint-disable-next-line @next/next/no-img-element -- vendor-managed external product images
    return <img src={imageUrl} alt="" loading="lazy" className={`${classes} object-cover`} />;
  }
  return <span className={classes}><span>{imageUrl || <Icon name="bag" className="h-12 w-12 opacity-40" />}</span></span>;
}

export function CheckoutSteps({ current }: { current: "cart" | "payment" | "done" }) {
  const t = useTranslations("ui");

  return <nav className="checkout-steps" aria-label={t("checkoutProgress")}><span aria-current={current === "cart" ? "step" : undefined}><b>1</b>{t("yourCart")}</span><i aria-hidden="true" /><span aria-current={current === "payment" ? "step" : undefined}><b>2</b>{t("detailsPayment")}</span><i aria-hidden="true" /><span aria-current={current === "done" ? "step" : undefined}><b>3</b>{t("allDone")}</span></nav>;
}
