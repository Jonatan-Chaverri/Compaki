// "My profile" — the signed-in user's name, their wallet address and its
// demo-dollar balance (read live from Stellar testnet).

import { AppHeader, EmptyState, PageHeading } from "@/components/shell";
import { apiFetch } from "@/lib/api";

import { ProfileView, type ProfileUser } from "./profile-view";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const res = await apiFetch("/api/me");
  if (!res.ok) throw new Error(`Profile request failed (${res.status})`);
  const { user } = (await res.json()) as { user: ProfileUser | null };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50/60">
        <AppHeader />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-xl px-6 py-20 text-center">
          <EmptyState
            icon="shield"
            title="Your profile and wallet live here."
            description="Sign in to see your balance, your wallet address and how others see you on Compaki."
            href="/login?next=/profile"
            action="Sign in"
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-6 py-12">
        <PageHeading
          eyebrow="Your Compaki"
          title="My profile"
          description="Your wallet, your balance, and how vendors and communities see you."
        />
        <ProfileView user={user} />
      </main>
    </div>
  );
}
