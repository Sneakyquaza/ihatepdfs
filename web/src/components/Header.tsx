import Link from "next/link";
import type { Dict, Locale } from "@/i18n";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function Header({ locale, t }: { locale: Locale; t: Dict }) {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Link href={`/${locale}`} className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm text-white">PK</span>
          <span>
            PDF<span className="text-brand">Kit</span>
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
