import { useTranslations } from "next-intl";
export default function Loading() {
  const t = useTranslations("ui");

  return <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-6 py-16" aria-busy="true"><p role="status" className="eyebrow mb-8">{t("gettingTheGoodThingsReady")}</p><div className="h-40 rounded-3xl bg-slate-100" /><div className="mt-8 grid gap-6 sm:grid-cols-3">{[1,2,3].map(i => <div key={i} className="h-64 rounded-2xl border border-slate-200 bg-white p-5"><div className="h-36 rounded-xl bg-slate-100" /><div className="mt-5 h-3 w-2/3 rounded bg-slate-100" /><div className="mt-3 h-3 w-1/2 rounded bg-slate-100" /></div>)}</div></main>;
}
