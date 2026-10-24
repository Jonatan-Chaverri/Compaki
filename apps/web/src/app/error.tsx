"use client";

import Link from "next/link";
import { AppHeader, EmptyState } from "@/components/shell";

export default function ErrorPage({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <div className="min-h-screen bg-background"><AppHeader /><main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-16"><div role="alert"><EmptyState icon="store" title="A little pause. We’ll be right back." description="We couldn’t load this page right now. Try again in a moment, or head back to explore." /></div><div className="mt-6 flex flex-wrap justify-center gap-3"><button onClick={unstable_retry} className="button-primary">Try again</button><Link href="/" className="button-secondary">Back to home</Link></div></main></div>;
}
