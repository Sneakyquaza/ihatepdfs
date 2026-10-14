import { HeartCrack } from "lucide-react";
import Link from "next/link";
import type { Dict, Locale } from "@/i18n";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function Header({ locale, t }: { locale: Locale; t: Dict }) {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Link href={`/${locale}`} aria-label="iHatePDFs" className="flex items-center gap-2 pb-2 text-xl font-extrabold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white" aria-hidden>
            <HeartCrack className="h-5 w-5" />
          </span>
          {/* "iLovePDFs" with "Love" struck out and "Hate" scribbled underneath */}
          <span className="flex items-baseline leading-none" aria-hidden>
            i
            <span className="relative">
              <span className="text-brand line-through decoration-ink decoration-[3px]">Love</span>
              <span className="absolute left-1/2 top-[75%] -translate-x-1/2 -rotate-6 font-hand text-lg font-bold text-ink">
                Hate
              </span>
            </span>
            PDFs
          </span>
        </Link>
        <nav className="hidden items-center gap-5 text-sm font-semibold text-muted md:flex">
          <Link href={`/${locale}#tools`} className="hover:text-ink">{t.nav.allTools}</Link>
          <Link href={`/${locale}?cat=organize#tools`} className="hover:text-ink">{t.nav.pdfTools}</Link>
          <Link href={`/${locale}?cat=image#tools`} className="hover:text-ink">{t.nav.imageTools}</Link>
        </nav>
        <div className="ml-auto">
          <LocaleSwitcher locale={locale} label={t.nav.language} />
        </div>
      </div>
    </header>
  );
}
