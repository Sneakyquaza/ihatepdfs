import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { getDict, isLocale, LOCALES } from "@/i18n";
import "../globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

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
    alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])) },
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
    <html lang={locale}>
      <body className={`${geist.variable} min-h-screen font-sans antialiased`}>
        <Header locale={locale} t={t} />
        <main>{children}</main>
        <footer className="mt-24 border-t border-black/5 bg-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:justify-between">
            <p>{t.footer.tagline}</p>
            <p className="flex flex-wrap gap-x-4">
              <a href="https://github.com/Sneakyquaza/ihatepdfs" className="underline hover:text-ink" rel="noopener">
                {t.footer.source}
              </a>
              <span>© {new Date().getFullYear()} iHatePDFs. {t.footer.rights}</span>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
