import { Suspense } from "react";

import { AppHeader } from "@/components/shell";

import { AuthForm } from "./auth-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader />
      <main className="mx-auto w-full max-w-md px-6 py-12">
        <Suspense>
          <AuthForm />
        </Suspense>
      </main>
    </div>
  );
}
