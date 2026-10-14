"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Locale, LOCALES } from "@/i18n";

export function LocaleSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname() ?? `/${locale}`;
  const rest = pathname.split("/").slice(2).join("/");
  return (
    <div className="flex items-center gap-1 rounded-full bg-canvas p-1 text-xs font-bold" aria-label={label}>
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={`/${l}${rest ? `/${rest}` : ""}`}
          className={`rounded-full px-3 py-1 uppercase ${l === locale ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          aria-current={l === locale ? "true" : undefined}
        >
          {l}
        </Link>
      ))}
    </div>
  );
}
