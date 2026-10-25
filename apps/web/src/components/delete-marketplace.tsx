"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";
import styles from "./delete-marketplace.module.css";

export function DeleteMarketplace({ name, slug }: { name: string; slug: string }) {
  const t = useTranslations("ui");
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/marketplaces/${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        setError(t(response.status === 401 ? "deleteMarketplaceSignIn" : response.status === 403 ? "deleteMarketplaceOwnerOnly" : "deleteMarketplaceFailed"));
        setBusy(false);
        return;
      }
      setOpen(false);
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError(t("deleteMarketplaceFailed"));
      setBusy(false);
    }
  };

  return <>
    <details className={styles.settings}>
      <summary>{t("marketplaceSettings")}</summary>
      <div className={styles.row}>
        <div><h2>{t("deleteMarketplace")}</h2><p>{t("deleteMarketplaceHint")}</p></div>
        <button type="button" className={styles.deleteButton} onClick={() => { setError(null); setOpen(true); }}><Icon name="trash" className="h-4 w-4" />{t("deleteMarketplace")}</button>
      </div>
    </details>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="delete-marketplace-title" aria-describedby="delete-marketplace-description" onCancel={event => { if (busy) event.preventDefault(); else setOpen(false); }} onClose={() => setOpen(false)}>
      <span className={styles.icon}><Icon name="trash" className="h-6 w-6" /></span>
      <h2 id="delete-marketplace-title">{t("deleteMarketplaceTitle", { name })}</h2>
      <p id="delete-marketplace-description">{t("deleteMarketplaceDescription")}</p>
      <p className={styles.note}>{t("deleteMarketplaceFundNote")}</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" className="button-secondary button-small" disabled={busy} autoFocus onClick={() => setOpen(false)}>{t("cancel")}</button>
        <button type="button" className={styles.confirm} disabled={busy} onClick={() => void remove()}>{t(busy ? "deletingMarketplace" : "deleteMarketplaceConfirm")}</button>
      </div>
      {busy && <span role="status" className={styles.status}>{t("deletingMarketplace")}</span>}
    </dialog>
  </>;
}
