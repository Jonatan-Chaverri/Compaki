"use server";
import { cookies } from "next/headers";
import { isAppLocale, localeCookie, type AppLocale } from "./config";

export async function setAppLocale(locale: AppLocale): Promise<void> {
  if (!isAppLocale(locale)) throw new Error("Unsupported locale");
  (await cookies()).set(localeCookie, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
}
