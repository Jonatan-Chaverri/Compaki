import { AppHeader, EmptyState } from "@/components/shell";

export default function NotFound() {
  return <div className="min-h-screen bg-background"><AppHeader /><main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-16"><p className="eyebrow mb-5 text-center">A small detour · 404</p><EmptyState icon="search" title="Let’s get you back to the good things." description="We couldn’t find this page. It may have moved, or this marketplace or product may no longer be available." href="/marketplaces" action="Explore marketplaces" /></main></div>;
}
