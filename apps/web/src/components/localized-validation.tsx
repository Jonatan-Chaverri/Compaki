"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

/** Browser validation bubbles otherwise follow the browser's language setting. */
export function LocalizedValidation() {
  const t = useTranslations("ui");
  useEffect(() => {
    const translated = new Set<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();
    const field = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement ? target : null;
    const clear = (event: Event) => {
      const element = field(event.target);
      if (element && translated.has(element)) {
        element.setCustomValidity("");
        translated.delete(element);
      }
    };
    const invalid = (event: Event) => {
      const element = field(event.target);
      if (!element) return;
      if (translated.has(element)) element.setCustomValidity("");
      const validity = element.validity;
      if (validity.customError) return;
      let message = t("validationValue");
      if (validity.valueMissing) message = t("validationRequired");
      else if (validity.typeMismatch && element instanceof HTMLInputElement)
        message = t(element.type === "email" ? "validationEmail" : "validationUrl");
      else if (validity.tooShort && "minLength" in element)
        message = t("validationShort", { count: element.minLength });
      else if (validity.tooLong && "maxLength" in element)
        message = t("validationLong", { count: element.maxLength });
      else if (validity.rangeUnderflow && element instanceof HTMLInputElement)
        message = t("validationMin", { value: element.min });
      else if (validity.rangeOverflow && element instanceof HTMLInputElement)
        message = t("validationMax", { value: element.max });
      element.setCustomValidity(message);
      translated.add(element);
    };
    document.addEventListener("invalid", invalid, true);
    document.addEventListener("input", clear, true);
    document.addEventListener("change", clear, true);
    return () => {
      for (const element of translated) element.setCustomValidity("");
      document.removeEventListener("invalid", invalid, true);
      document.removeEventListener("input", clear, true);
      document.removeEventListener("change", clear, true);
    };
  }, [t]);
  return null;
}
