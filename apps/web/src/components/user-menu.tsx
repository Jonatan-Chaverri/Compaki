"use client";

// Session widget for every top bar: "Sign in" when logged out, the user's
// name + sign out when logged in. One session works across all marketplaces
// (the cookie is scoped to the whole site).

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface SessionUser {
  id: string;
  name: string;
  email: string | null;
}

export function UserMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<"loading" | "out" | "in">("loading");
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((res) => res.json())
      .then((data: { user: SessionUser | null }) => {
        if (cancelled) return;
        setUser(data.user);
        setState(data.user ? "in" : "out");
      })
      .catch(() => {
        if (!cancelled) setState("out");
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setState("out");
    router.refresh();
  };

  if (state === "loading") return <span className="w-14" />;

  if (state === "out") {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className="rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
      >
        Sign in
      </Link>
    );
  }

  return (
    <span className="flex items-center gap-3">
      <span className="hidden text-sm font-medium text-slate-700 sm:inline">{user?.name}</span>
      <button
        onClick={() => void signOut()}
        className="text-sm text-slate-400 transition hover:text-slate-700"
      >
        Sign out
      </button>
    </span>
  );
}
