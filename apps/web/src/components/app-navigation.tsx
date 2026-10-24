"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";

export function AppNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
    };
    const closeOutside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !toggle.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);
  const links = [
    { href: "/marketplaces", label: "Explore marketplaces", active: pathname === "/marketplaces" || pathname.startsWith("/m/") },
    { href: "/#how-it-works", label: "How it works", active: false },
    { href: "/dashboard", label: "For your community", active: pathname.startsWith("/dashboard") || pathname === "/onboarding" },
  ];
  return <>
    <nav className="desktop-nav" aria-label="Main navigation">
      {links.map(link => <Link key={link.href} href={link.href} aria-current={link.active ? "page" : undefined}>{link.label}</Link>)}
    </nav>
    <button ref={toggle} className="mobile-nav-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}><Icon name={open ? "close" : "menu"} /></button>
    {open && <nav ref={menu} id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">
      {links.map(link => <Link key={link.href} href={link.href} aria-current={link.active ? "page" : undefined} onClick={() => setOpen(false)}>{link.label}<Icon name="chevron" className="h-4 w-4" /></Link>)}
      <Link href="/orders" onClick={() => setOpen(false)}>My orders<Icon name="bag" className="h-4 w-4" /></Link>
      <Link href="/rewards" onClick={() => setOpen(false)}>My community rewards<Icon name="leaf" className="h-4 w-4" /></Link>
    </nav>}
  </>;
}
