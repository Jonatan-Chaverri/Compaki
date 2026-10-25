import { Suspense } from "react";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { MarketArt } from "@/components/market-art";
import { DemoNotice, Logo } from "@/components/shell";
import { ThemeMenu } from "@/components/theme-menu";
import { SignIn } from "./sign-in";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome to Compaki — Sign in or get started" };

export default function LoginPage() {
  return (
    <div className="login-page">
      <DemoNotice />
      <header className="login-header">
        <Link href="/" aria-label="Compaki home"><Logo /></Link>
        <div className="login-header-actions"><Link href="/marketplaces" className="login-browse"><span>Just exploring?</span> Browse marketplaces <Icon name="arrow" className="h-4 w-4" /></Link><ThemeMenu /></div>
      </header>
      <main id="main-content" tabIndex={-1} className="login-layout">
        <section className="login-story" aria-labelledby="login-story-title">
          <div className="login-story-top"><span className="login-story-label"><Icon name="leaf" className="h-3.5 w-3.5" /> A place for your kind of good</span><span className="login-story-dot" /></div>
          <h2 id="login-story-title">Good things start<br />with <em>your people.</em></h2>
          <p>Find something you love. Meet the people who made it. Grow something good together.</p>
          <div className="login-illustration"><MarketArt /><div className="login-impact-note"><span><Icon name="heart" className="h-4 w-4" /></span><div><strong>More than a marketplace.</strong><p>A little connection. A shared future.</p></div><Icon name="spark" className="h-4 w-4" /></div></div>
          <div className="login-story-bottom"><span><Icon name="bag" className="h-4 w-4" /> Shop with purpose</span><span><Icon name="people" className="h-4 w-4" /> Grow together</span></div>
        </section>
        <div className="login-access">
          <Suspense fallback={<div className="login-card login-card-loading" role="status"><span className="login-card-symbol"><Icon name="leaf" className="h-5 w-5" /></span><p>Getting your place ready…</p></div>}>
            <SignIn />
          </Suspense>
          <p className="login-reassurance"><Icon name="shield" className="h-3.5 w-3.5" /> One account for all your communities.</p>
        </div>
      </main>
    </div>
  );
}
