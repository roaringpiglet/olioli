import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { LOCALE } from "@/i18n/config";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();
  return (
    <html lang={LOCALE}>
      <body>
        <NextIntlClientProvider locale={LOCALE} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
