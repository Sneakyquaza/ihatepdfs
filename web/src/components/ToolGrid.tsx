"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { getDict, type Locale } from "@/i18n";
import { type Category, CATEGORIES, TOOLS } from "@/lib/tools";
import { ToolIcon } from "./ToolIcon";

export function ToolGrid({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const router = useRouter();
  const params = useSearchParams();
  const catParam = params.get("cat");
  const cat = CATEGORIES.includes(catParam as Category) ? (catParam as Category) : null;
  const [query, setQuery] = useState("");

  const tools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TOOLS.filter((tool) => {
      if (cat && tool.category !== cat) return false;
      if (!q) return true;
      const { name, desc } = t.tools[tool.id as keyof typeof t.tools];
      return `${name} ${desc}`.toLowerCase().includes(q);
    });
  }, [cat, query, t]);

  const setCat = (c: Category | null) =>
    router.replace(c ? `/${locale}?cat=${c}#tools` : `/${locale}#tools`, { scroll: false });

  const chip = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-semibold transition ${active ? "bg-ink text-white" : "bg-white text-ink hover:bg-black/5"}`;

  return (
    <div>
      <div className="flex flex-col items-center gap-4">
        <div className="flex flex-wrap justify-center gap-2">
          <button className={chip(!cat)} onClick={() => setCat(null)}>{t.home.all}</button>
          {CATEGORIES.map((c) => (
            <button key={c} className={chip(cat === c)} onClick={() => setCat(c)}>{t.categories[c]}</button>
          ))}
        </div>
        <label className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.home.search}
            className="w-full rounded-full border border-black/10 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand"
          />
        </label>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tools.map((tool) => {
          const { name, desc } = t.tools[tool.id as keyof typeof t.tools];
          return (
            <Link
              key={tool.id}
              href={`/${locale}/${tool.id}`}
              className="group relative rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span
                className="grid h-11 w-11 place-items-center rounded-xl"
                style={{ background: `${tool.color}18`, color: tool.color }}
              >
                <ToolIcon name={tool.icon} className="h-6 w-6" />
              </span>
              <h3 className="mt-4 font-bold">{name}</h3>
              <p className="mt-1 text-sm leading-snug text-muted">{desc}</p>
              {(tool.id === "remove-bg" || tool.id === "upscale-image") && (
                <span className="absolute right-4 top-4 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  {locale === "fr" ? "IA" : "AI"}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      {!tools.length && <p className="mt-10 text-center text-muted">{t.home.noResult}</p>}
    </div>
  );
}
