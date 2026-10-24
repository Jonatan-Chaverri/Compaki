// Personal details and everyday account actions, with payment references on demand.

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
            title="Make yourself at home."
            description="Sign in to manage your profile, check your balance and find your purchases and rewards."
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
      <main id="main-content" tabIndex={-1} className="profile-page">
        <PageHeading
          eyebrow="Your Compaki"
          title="My profile"
          description="A space for you, your purchases and your community."
        />
        <ProfileView user={user} />
      </main>
    </div>
  );
}
