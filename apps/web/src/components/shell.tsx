import Image from "next/image";
import Link from "next/link";
import { AppNavigation } from "./app-navigation";
import { Icon } from "./icon";
import { UserMenu } from "./user-menu";

export function Logo() {
  return <span className="brand-logo"><Image src="/logo.png" alt="" width={36} height={36} priority /><span>compaki<span className="brand-period">.</span></span></span>;
}

export function DemoNotice() {
  return <div className="demo-notice"><span className="demo-dot" /><strong>Explore the demo</strong><span>All purchases and balances use test funds. No real money.</span></div>;
}

export function AppHeader({ right }: { right?: React.ReactNode }) {
  return <>
    <DemoNotice />
    <header className="app-header">
      <div className="header-inner">
        <Link href="/" aria-label="Compaki home" className="shrink-0"><Logo /></Link>
        <AppNavigation />
        <div className="header-actions">{right}<UserMenu /></div>
      </div>
    </header>
  </>;
}

export function AppFooter() {
  return <footer className="app-footer"><div className="footer-inner">
    <div><Link href="/" aria-label="Compaki home"><Logo /></Link><p>Good things happen when we grow together.</p></div>
    <nav aria-label="Footer navigation"><Link href="/marketplaces">Explore</Link><Link href="/onboarding">Start a marketplace</Link><Link href="/#how-it-works">How it works</Link></nav>
    <span className="footer-note">Built for people. Powered by Stellar.<br />© {new Date().getFullYear()} Compaki · Testnet demo</span>
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
  return <nav className="checkout-steps" aria-label="Checkout progress"><span aria-current={current === "cart" ? "step" : undefined}><b>1</b>Your cart</span><i aria-hidden="true" /><span aria-current={current === "payment" ? "step" : undefined}><b>2</b>Details & payment</span><i aria-hidden="true" /><span aria-current={current === "done" ? "step" : undefined}><b>3</b>All done</span></nav>;
}
