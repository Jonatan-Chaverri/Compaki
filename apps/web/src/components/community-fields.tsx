"use client";
import { useTranslations } from "next-intl";

import { useId } from "react";
import type { CommunityDraft } from "@/lib/community";
import type { CommunityMode } from "@/lib/rewards";

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-relaxed text-slate-900 focus:border-brand-500";

export function CommunityFields({ value, onChange, disabled = false, mode = "classic" }: { value: CommunityDraft; onChange: (value: CommunityDraft) => void; disabled?: boolean; mode?: CommunityMode }) {
  const t = useTranslations("ui");

  const id = useId();
  const onChain = mode !== "classic";
  const update = (key: keyof CommunityDraft, text: string) => onChange({ ...value, [key]: text });
  return <fieldset disabled={disabled} className="space-y-5">
    <legend className="mb-2 text-lg font-medium tracking-tight text-slate-900">{t("tellPeopleWhatTheirPurchaseMakesPossible")}</legend>
    <p className="text-xs leading-relaxed text-slate-500">{t("theseDetailsAppearOnYourPublicCommunityPageExplainYourPurpose")}</p>
    <div><label htmlFor={`${id}-purpose`} className="mb-2 block text-sm font-medium">{t("whatIsYourCommunityGoal")}</label><textarea id={`${id}-purpose`} required minLength={20} maxLength={2000} rows={3} className={inputClass} value={value.communityPurpose} onChange={e => update("communityPurpose", e.target.value)} placeholder={t("weHelpRestoreTheRiverThatOurFarmingCommunityDependsOn")} aria-describedby={`${id}-purpose-help`} /><p id={`${id}-purpose-help`} className="mt-1 text-xs text-slate-500">{t("describeTheChangeYouWantToMakeAndHowContributionsWill")}</p></div>
    <div><label htmlFor={`${id}-beneficiaries`} className="mb-2 block text-sm font-medium">{t("whoBenefitsAndWhy")}</label><textarea id={`${id}-beneficiaries`} required minLength={10} maxLength={2000} rows={3} className={inputClass} value={value.communityBeneficiaries} onChange={e => update("communityBeneficiaries", e.target.value)} placeholder={t("theNeighborhoodSchoolAndLocalReforestationVolunteersTheSchoolBuysSeedlings")} /><p className="mt-1 text-xs text-slate-500">{t("explainWhoTheInitiativeSupportsAtLeast10CharactersPaymentRecipients")}</p></div>
    <div><label htmlFor={`${id}-distribution`} className="mb-2 block text-sm font-medium">{t("howAndWhenWillTheFundsBeShared")}{onChain && <span className="font-normal text-slate-500"> {" "}{t("optional")}</span>}</label><textarea id={`${id}-distribution`} required={!onChain} minLength={onChain ? undefined : 20} maxLength={4000} rows={4} className={inputClass} value={value.communityDistribution} onChange={e => update("communityDistribution", e.target.value)} placeholder={mode === "rewards" ? t("everyMonthThePeopleWhoSoldAndBoughtHereShareOur") : mode === "fundraise" ? t("weAreRaisingMoneyForTheSchoolSNewWaterTank") : t("contributionsGoToTheCommunityFundAccountWithEachSaleThe")} /><p className="mt-1 text-xs leading-relaxed text-slate-500">{onChain ? t("anythingYouWantToAddInYourOwnWordsThePublic") : t("useAtLeast20CharactersExplainWhoManagesTheFundAnd")}</p></div>
    {mode === "classic" && <div><label htmlFor={`${id}-goal`} className="mb-2 block text-sm font-medium">{t("fundraisingTarget")}{" "}<span className="font-normal text-slate-500">{t("optionalUsd")}</span></label><input id={`${id}-goal`} type="number" min="0.01" max="1000000000" step="0.01" className={inputClass} value={value.communityGoalUsd} onChange={e => update("communityGoalUsd", e.target.value)} placeholder={t("eG2500")} /><p className="mt-1 text-xs text-slate-500">{t("useAPositiveAmountWithUpToTwoDecimalPlacesProgress")}</p></div>}
  </fieldset>;
}
