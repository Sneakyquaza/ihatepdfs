import type { Metadata } from "next";
import { Caveat, Geist } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { THEME_SCRIPT } from "@/components/ThemeToggle";
import { getDict, isLocale, LOCALES } from "@/i18n";
import { alternates, SITE_URL } from "@/lib/site";
import "../globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], weight: "700" });

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDict(locale);
  return {
    title: t.meta.title,
    description: t.meta.description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: `/${locale}`, languages: alternates("") },
    openGraph: { type: "website", siteName: "iHatePDFs", title: t.meta.title, description: t.meta.description, locale },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  return (
    // data-theme is set before hydration by THEME_SCRIPT
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${geist.variable} ${caveat.variable} min-h-screen font-sans antialiased`}>
        <Header locale={locale} t={t} />
        <main>{children}</main>
        <footer className="mt-24 border-t border-line bg-surface">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:justify-between">
            <p>{t.footer.tagline}</p>
            <nav className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href={`/${locale}/legal`} className="hover:text-ink">{t.footer.legal}</Link>
              <Link href={`/${locale}/privacy`} className="hover:text-ink">{t.footer.privacy}</Link>
              <a href="mailto:sneakyquaza@gmail.com" className="hover:text-ink">{t.footer.contact}</a>
              <a href="https://github.com/Sneakyquaza/ihatepdfs" className="hover:text-ink" rel="noopener">
                {t.footer.source}
              </a>
              <span>© {new Date().getFullYear()} iHatePDFs</span>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
