"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type Locale, LOCALES } from "@/i18n";

export function LocaleSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname() ?? `/${locale}`;
  const router = useRouter();
  const rest = pathname.split("/").slice(2).join("/");
  return (
    <div className="flex items-center gap-1 rounded-full bg-canvas p-1 text-xs font-bold" aria-label={label}>
      {LOCALES.map((l) => {
        const href = `/${l}${rest ? `/${rest}` : ""}`;
        return (
          <Link
            key={l}
            href={href}
            // keep the query and hash (e.g. ?cat=image#tools); read on click so the page stays static
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              router.push(href + window.location.search + window.location.hash);
            }}
            className={`rounded-full px-3 py-1 uppercase ${l === locale ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            aria-current={l === locale ? "true" : undefined}
          >
            {l}
          </Link>
        );
      })}
    </div>
  );
}
