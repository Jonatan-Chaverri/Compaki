import { getTranslations } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./brand-accents.css";
import { CompakiCavosProvider } from "@/components/cavos-provider";
import { AppFooter } from "@/components/shell";
import { LocalizedValidation } from "@/components/localized-validation";
import { ThemeSync } from "@/components/theme-sync";
import { themeBootstrap } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata() {
  const t = await getTranslations("ui");
  return { title: t("siteTitle"), description: t("siteDescription") };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const t = await getTranslations("ui");

  const locale = await getLocale();
  return (
    <html
      lang={locale}
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeSync />
        <a className="skip-link" href="#main-content">
          {t("skipToContent")}</a>
        <NextIntlClientProvider><LocalizedValidation /><CompakiCavosProvider>
          <div id="app-content" className="flex-1">
            {children}
          </div>
          <AppFooter />
        </CompakiCavosProvider></NextIntlClientProvider>
      </body>
    </html>
  );
}
