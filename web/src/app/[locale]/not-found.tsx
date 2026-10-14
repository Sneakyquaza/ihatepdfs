"use client";

import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEFAULT_LOCALE, getDict, isLocale } from "@/i18n";

// not-found pages receive no params: read the locale from the URL.
export default function NotFound() {
  const seg = usePathname()?.split("/")[1] ?? "";
  const locale = isLocale(seg) ? seg : DEFAULT_LOCALE;
  const t = getDict(locale);
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <FileQuestion className="mx-auto h-16 w-16 text-accent" />
      <h1 className="mt-6 text-4xl font-extrabold tracking-tight">{t.notFound.title}</h1>
      <p className="mt-3 text-muted">{t.notFound.text}</p>
      <Link href={`/${locale}`} className="mt-8 inline-block rounded-xl bg-brand px-6 py-3 font-bold text-white hover:bg-brand-dark">
        {t.notFound.cta}
      </Link>
    </div>
  );
}
