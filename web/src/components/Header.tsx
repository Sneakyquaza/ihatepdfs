import { Heart, HeartCrack } from "lucide-react";
import Link from "next/link";
import type { Dict, Locale } from "@/i18n";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { MobileMenu } from "./MobileMenu";
import { ThemeToggle } from "./ThemeToggle";

export function Header({ locale, t }: { locale: Locale; t: Dict }) {
  const links = [
    { href: `/${locale}#tools`, label: t.nav.allTools },
    { href: `/${locale}?cat=organize#tools`, label: t.nav.pdfTools },
    { href: `/${locale}?cat=image#tools`, label: t.nav.imageTools },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Link href={`/${locale}`} aria-label="iHatePDFs" className="flex items-center gap-2 pb-2 text-xl font-extrabold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white" aria-hidden>
            <HeartCrack className="h-5 w-5" />
          </span>
          {/* "i ♥ PDFs" with the heart struck out and "Hate" scribbled underneath */}
          <span className="flex items-center leading-none" aria-hidden>
            i
            <span className="relative mx-1 inline-flex">
              <Heart className="h-5 w-5 fill-brand text-brand" />
              <span className="absolute left-1/2 top-1/2 h-[2.5px] w-[125%] -translate-x-1/2 -translate-y-1/2 -rotate-[25deg] rounded-full bg-ink" />
              <span className="absolute left-1/2 top-[95%] -translate-x-1/2 -rotate-6 font-hand text-lg font-bold text-ink">
                Hate
              </span>
            </span>
            PDFs
          </span>
        </Link>
        <nav className="hidden items-center gap-5 text-sm font-semibold text-muted md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-ink">{l.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle labels={{ system: t.nav.themeSystem, light: t.nav.themeLight, dark: t.nav.themeDark }} />
          <LocaleSwitcher locale={locale} label={t.nav.language} />
          <MobileMenu links={links} label={t.nav.menu} />
        </div>
      </div>
    </header>
  );
}
