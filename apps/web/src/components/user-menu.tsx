"use client";

// Session widget for every top bar: a user icon with the name beneath it that
// opens a dropdown. The dropdown shows "Sign in / Create account" when logged
// out and the account details + "Sign out" when logged in. One session works
// across all marketplaces (the cookie is scoped to the whole site).

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface SessionUser {
  id: string;
  name: string;
  email: string | null;
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={className}
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />
    </svg>
  );
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function UserMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<"loading" | "out" | "in">("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const signOut = async () => {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setState("out");
    router.refresh();
  };

  if (state === "loading") return <span className="h-10 w-10" aria-hidden />;

  const loggedIn = state === "in" && user !== null;
  const next = encodeURIComponent(pathname);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={loggedIn ? `Account: ${user.name}` : "Account"}
        className="flex flex-col items-center gap-1 rounded-lg px-2 py-1 transition hover:bg-slate-50"
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
            loggedIn ? "bg-navy-900 text-white" : "border border-slate-200 text-slate-500"
          }`}
        >
          {loggedIn ? initialsOf(user.name) : <UserIcon className="h-4 w-4" />}
        </span>
        <span className="max-w-[7rem] truncate text-[11px] font-medium leading-none text-slate-600">
          {loggedIn ? user.name.split(/\s+/)[0] : "Account"}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {loggedIn ? (
            <>
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white">
                  {initialsOf(user.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {user.name}
                  </span>
                  {user.email && (
                    <span className="block truncate text-xs text-slate-500">{user.email}</span>
                  )}
                </span>
              </div>
              <button
                role="menuitem"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 text-slate-400"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5M21 12H9" />
                </svg>
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
                Browse freely — sign in to buy or sell.
              </p>
              <Link
                role="menuitem"
                href={`/login?next=${next}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
              >
                <UserIcon className="h-4 w-4 text-slate-400" />
                Sign in
              </Link>
              <Link
                role="menuitem"
                href={`/login?mode=register&next=${next}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 text-slate-400"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M19 8v6M22 11h-6" />
                </svg>
                Create account
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
