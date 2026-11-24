import type { Metadata } from "next";
import { Cairo, Inter } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/client";
import { getI18n } from "@/lib/i18n/server";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

/**
 * Localized metadata: the product name follows the active locale
 * (CONURE HR / كونور), the description names product and company only.
 * No slogan is rendered anywhere, including metadata.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  const name = dict.brand.productName;
  return {
    title: {
      default: name,
      template: `%s · ${name}`,
    },
    description: dict.brand.metadataDescription,
  };
}

/**
 * Applies the persisted theme (or the system preference) before first paint
 * to avoid a flash of the wrong color scheme. Storage key unchanged.
 */
const themeInit = `(function(){try{var t=localStorage.getItem('orbit-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The locale is resolved on the server from the validated preference
  // cookie, so the first HTML already carries the correct lang and dir:
  // no direction flash and no hydration mismatch.
  const { locale, dir, dict } = await getI18n();
  return (
    <html
      lang={locale}
      dir={dir}
      className={`${inter.variable} ${cairo.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        <I18nProvider locale={locale} dict={dict}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
