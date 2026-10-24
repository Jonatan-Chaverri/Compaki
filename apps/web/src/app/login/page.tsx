import { Suspense } from "react";
import { AppHeader } from "@/components/shell";
import { MarketArt } from "@/components/market-art";
import { Icon } from "@/components/icon";
import { AuthForm } from "./auth-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <div className="min-h-screen bg-background"><AppHeader /><main id="main-content" tabIndex={-1} className="auth-layout">
    <div className="auth-story"><span className="eyebrow">You belong here</span><h2>A little connection.<br /><em>A world of possibility.</em></h2><p>Your next favorite product, a new customer, a stronger community. It all starts with one account.</p><MarketArt variant="grow" /><div className="auth-benefit"><Icon name="check" className="h-4 w-4" />Shop across every Compaki marketplace</div><div className="auth-benefit"><Icon name="check" className="h-4 w-4" />Sell your products or bring a community together</div></div>
    <Suspense fallback={<div className="auth-form py-20 text-center" role="status">Getting things ready…</div>}><AuthForm /></Suspense>
  </main></div>;
}
