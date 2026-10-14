"use client";

import { Clock, Search, Star } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { type Dict, getDict, type Locale } from "@/i18n";
import { usePrefs } from "@/lib/prefs";
import { type Category, CATEGORIES, type Tool, TOOL_MAP, TOOLS } from "@/lib/tools";
import { ToolIcon } from "./ToolIcon";

const AI_TOOLS = new Set(["remove-bg", "upscale-image"]);
const linkClass = "mt-4 block font-bold after:absolute after:inset-0 after:rounded-2xl after:content-['']";

function ToolCard({
  tool, locale, t, favorite, onToggleFavorite,
}: { tool: Tool; locale: Locale; t: Dict; favorite: boolean; onToggleFavorite: () => void }) {
  const { name, desc } = t.tools[tool.id as keyof Dict["tools"]];
  return (
    <div className="group relative rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `${tool.color}18`, color: tool.color }}>
          <ToolIcon name={tool.icon} className="h-6 w-6" />
        </span>
        {AI_TOOLS.has(tool.id) && (
          <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase text-white">{locale === "fr" ? "IA" : "AI"}</span>
        )}
      </div>
      {/* stretched link: the whole card is clickable, the star button stays a separate control */}
      {tool.fullPageLoad ? (
        <a href={`/${locale}/${tool.id}`} className={linkClass}>{name}</a>
      ) : (
        <Link href={`/${locale}/${tool.id}`} className={linkClass}>{name}</Link>
      )}
      <p className="mt-1 text-sm leading-snug text-muted">{desc}</p>
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-pressed={favorite}
        aria-label={favorite ? t.home.removeFavorite : t.home.addFavorite}
        title={favorite ? t.home.removeFavorite : t.home.addFavorite}
        className={`absolute right-3 top-3 z-10 rounded-full p-2 transition hover:bg-ink/5 ${
          favorite ? "text-amber-500" : "text-muted/40 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
        }`}
      >
        <Star className={`h-5 w-5 ${favorite ? "fill-amber-400" : ""}`} />
      </button>
    </div>
  );
}

const grid = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

/** Reads ?cat= on the client; render inside <Suspense fallback={<ToolGrid ... cat={null} />}> so the static HTML lists every tool. */
export function ToolGridFromUrl({ locale }: { locale: Locale }) {
  return <ToolGrid locale={locale} catParam={useSearchParams().get("cat")} />;
}

export function ToolGrid({ locale, catParam }: { locale: Locale; catParam: string | null }) {
  const t = getDict(locale);
  const router = useRouter();
  const cat = CATEGORIES.includes(catParam as Category) ? (catParam as Category) : null;
  // ?cat=pdf (header "PDF tools" link): every category except images
  const pdfOnly = catParam === "pdf";
  const [query, setQuery] = useState("");
  const { recent, favorites, toggleFavorite } = usePrefs();

  const tools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TOOLS.filter((tool) => {
      if (cat && tool.category !== cat) return false;
      if (pdfOnly && tool.category === "image") return false;
      if (!q) return true;
      const { name, desc } = t.tools[tool.id as keyof Dict["tools"]];
      return `${name} ${desc}`.toLowerCase().includes(q);
    });
  }, [cat, pdfOnly, query, t]);

  const setCat = (c: Category | null) =>
    router.replace(c ? `/${locale}?cat=${c}#tools` : `/${locale}#tools`, { scroll: false });

  const chip = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-semibold transition ${active ? "bg-ink text-canvas" : "bg-surface text-ink hover:bg-ink/5"}`;

  const card = (tool: Tool) => (
    <ToolCard
      key={tool.id}
      tool={tool}
      locale={locale}
      t={t}
      favorite={favorites.includes(tool.id)}
      onToggleFavorite={() => toggleFavorite(tool.id)}
    />
  );

  // Personal shortcuts only on the unfiltered view
  const showShortcuts = !cat && !pdfOnly && !query.trim();
  const recentTools = recent.filter((id) => !favorites.includes(id)).slice(0, 4).map((id) => TOOL_MAP[id]);
  const favoriteTools = favorites.map((id) => TOOL_MAP[id]);

  return (
    <div>
      <div className="flex flex-col items-center gap-4">
        <div className="flex flex-wrap justify-center gap-2">
          <button className={chip(!cat && !pdfOnly)} onClick={() => setCat(null)}>{t.home.all}</button>
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
            className="w-full rounded-full border border-line bg-surface py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand"
          />
        </label>
      </div>

      {showShortcuts && favoriteTools.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
            <Star className="h-4 w-4 fill-amber-400 text-amber-500" /> {t.home.favorites}
          </h2>
          <div className={grid}>{favoriteTools.map(card)}</div>
        </section>
      )}
      {showShortcuts && recentTools.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
            <Clock className="h-4 w-4" /> {t.home.recent}
          </h2>
          <div className={grid}>{recentTools.map(card)}</div>
        </section>
      )}
      {showShortcuts && (favoriteTools.length > 0 || recentTools.length > 0) && (
        <h2 className="mb-3 mt-10 text-sm font-bold uppercase tracking-wide text-muted">{t.nav.allTools}</h2>
      )}

      <div className={`${grid} ${showShortcuts && (favoriteTools.length || recentTools.length) ? "" : "mt-8"}`}>{tools.map(card)}</div>
      {!tools.length && <p className="mt-10 text-center text-muted">{t.home.noResult}</p>}
    </div>
  );
}
