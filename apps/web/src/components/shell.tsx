import Link from "next/link";

import { UserMenu } from "./user-menu";

/** Shared app chrome: white top bar with logo, optional right slot, session menu. */
export function AppHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="border-b border-slate-100 bg-white">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
            C
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-900">Compaki</span>
        </Link>
        <span className="flex items-center gap-4">
          {right}
          <UserMenu />
        </span>
      </div>
    </header>
  );
}

/** Product visual: an image URL renders as <img>, anything else as an emoji tile. */
export function ProductVisual({
  imageUrl,
  size = "md",
}: {
  imageUrl: string | null;
  size?: "sm" | "md";
}) {
  const classes = size === "sm" ? "h-10 w-10 rounded-lg text-xl" : "h-24 w-full rounded-xl text-4xl";
  if (imageUrl && /^https?:\/\//.test(imageUrl)) {
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary external demo URLs
    return <img src={imageUrl} alt="" className={`${classes} bg-slate-50 object-cover`} />;
  }
  return (
    <span className={`flex items-center justify-center bg-slate-50 ${classes}`}>
      {imageUrl || "📦"}
    </span>
  );
}
