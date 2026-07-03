import Link from "next/link";

import { Logo } from "@/components/shell";
import { UserMenu } from "@/components/user-menu";

const FEATURES = [
  {
    title: "Instant settlement",
    description:
      "Vendors get paid in seconds, not weeks — anywhere in the world. No holds, no rolling reserves, no waiting for the platform to release funds.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" />
      </svg>
    ),
  },
  {
    title: "Automatic splits",
    description:
      "Configure revenue sharing once — every sale splits itself between vendor, operator, and community fund the moment it happens. No invoices, no reconciliation.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h4m0 0c2.5 0 3.5-4 6-4h6m-16 4c2.5 0 3.5 4 6 4h6m-2.5-9.5L20 8l-2.5 2.5m0 3L20 16l-2.5 2.5" />
      </svg>
    ),
  },
  {
    title: "Verifiable transparency",
    description:
      "Every buyer can see exactly where their money went — a public, itemized receipt for each purchase showing every party's share, down to the cent.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/80 backdrop-blur">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/" className="shrink-0">
            <Logo />
          </Link>
          <div className="hidden items-center gap-8 whitespace-nowrap text-sm font-medium text-slate-600 lg:flex">
            <Link href="/marketplaces" className="hover:text-slate-900">
              Explore marketplaces
            </Link>
            <a href="#features" className="hover:text-slate-900">
              Features
            </a>
            <a href="#regenerative" className="hover:text-slate-900">
              Regenerative mode
            </a>
          </div>
          <span className="flex shrink-0 items-center gap-4">
            <UserMenu />
            <Link
              href="/onboarding"
              className="whitespace-nowrap rounded-full bg-navy-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-navy-700"
            >
              Create your marketplace
            </Link>
          </span>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-24 pt-20 text-center sm:pt-28">
          <p className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-700">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            Payments that settle themselves
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
            Deploy your global marketplace in 5 minutes
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            Multi-vendor. Instant global payouts. Automatic revenue splits. No
            payment infrastructure required.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/onboarding"
              className="rounded-full bg-navy-900 px-8 py-3.5 text-base font-medium text-white shadow-sm transition hover:bg-navy-700"
            >
              Create your marketplace
            </Link>
            <Link
              href="/marketplaces"
              className="rounded-full border border-slate-200 px-8 py-3.5 text-base font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Explore marketplaces
            </Link>
          </div>

          {/* Illustrative split receipt */}
          <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-lg shadow-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Handwoven basket
                </p>
                <p className="text-xs text-slate-500">Paid just now · settled</p>
              </div>
              <p className="text-lg font-semibold text-slate-900">$42.00</p>
            </div>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="h-2 w-2 rounded-full bg-navy-900" />
                  Vendor — Ana&apos;s Crafts
                </span>
                <span className="font-medium text-slate-900">$37.80</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  Marketplace operator
                </span>
                <span className="font-medium text-slate-900">$3.36</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Community fund
                </span>
                <span className="font-medium text-slate-900">$0.84</span>
              </li>
            </ul>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full">
              <div className="w-[90%] bg-navy-900" />
              <div className="w-[8%] bg-slate-400" />
              <div className="w-[2%] bg-emerald-500" />
            </div>
          </div>
        </section>

        {/* Feature cards */}
        <section id="features" className="border-t border-slate-100 bg-slate-50/60">
          <div className="mx-auto w-full max-w-6xl px-6 py-24">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-slate-900">
              Payment infrastructure, already built
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-slate-600">
              Everything a marketplace needs to move money — without hiring a
              payments team.
            </p>
            <div className="mt-14 grid gap-6 sm:grid-cols-3">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
                >
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-navy-900 text-white">
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Regenerative mode callout */}
        <section id="regenerative" className="mx-auto w-full max-w-6xl px-6 py-24">
          <div className="grid items-center gap-12 rounded-3xl border border-emerald-100 bg-emerald-50/50 p-10 sm:grid-cols-2 sm:p-14">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-700">
                Regenerative mode
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
                Every sale can give a little back
              </h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                Turn on an optional community fund and a percentage of every
                sale flows to it automatically — a local school, a reforestation
                project, a producers&apos; cooperative. You choose the cause and
                the percentage.
              </p>
              <p className="mt-3 leading-relaxed text-slate-600">
                And because every receipt is public, buyers, vendors, and the
                community can all see the fund growing with each purchase.
                Giving back stops being a marketing claim and becomes a visible
                fact.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-900">
                Community fund — Escuela Verde
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-emerald-600">
                $1,284.50
              </p>
              <p className="text-xs text-slate-500">
                raised from 1,529 sales · 2% of every purchase
              </p>
              <ul className="mt-5 space-y-2.5 border-t border-slate-100 pt-4 text-sm text-slate-600">
                <li className="flex justify-between">
                  <span>Ceramic mug · $18.00</span>
                  <span className="font-medium text-emerald-600">+$0.36</span>
                </li>
                <li className="flex justify-between">
                  <span>Coffee sampler · $32.00</span>
                  <span className="font-medium text-emerald-600">+$0.64</span>
                </li>
                <li className="flex justify-between">
                  <span>Handwoven basket · $42.00</span>
                  <span className="font-medium text-emerald-600">+$0.84</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="border-t border-slate-100">
          <div className="mx-auto w-full max-w-6xl px-6 py-24 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
              Your marketplace could be live today
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-slate-600">
              Name it, invite your vendors, set your split. We handle the money.
            </p>
            <Link
              href="/onboarding"
              className="mt-8 inline-block rounded-full bg-navy-900 px-8 py-3.5 text-base font-medium text-white shadow-sm transition hover:bg-navy-700"
            >
              Create your marketplace
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-slate-500 sm:flex-row">
          <Logo />
          <p>
            © {new Date().getFullYear()} Compaki. Instant, transparent
            marketplace payments.
          </p>
        </div>
      </footer>
    </div>
  );
}
