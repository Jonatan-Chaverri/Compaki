"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "./icon";

/** Optional, keyboard-accessible help that also works on touch screens. */
export function InfoHint({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTranslations("ui");
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return <span className="info-hint" ref={root} onBlur={(event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} type="button" aria-label={t("moreInformationAbout", { label })}
      aria-expanded={open} aria-controls={id} aria-describedby={open ? id : undefined} className="info-hint-trigger" onClick={() => setOpen(!open)}>
      <Icon name="info" className="h-4 w-4" />
    </button>
    {open && <span id={id} role="note" className="info-hint-content">{children}</span>}
  </span>;
}
