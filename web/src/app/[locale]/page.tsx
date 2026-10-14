import { Lock, ShieldCheck, Zap } from "lucide-react";
import { Suspense } from "react";
import { ToolGrid } from "@/components/ToolGrid";
import { getDict, isLocale } from "@/i18n";
import { notFound } from "next/navigation";

const WHY_ICONS = [ShieldCheck, Zap, Lock];

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  return (
    <>
      <section className="mx-auto max-w-4xl px-4 pb-8 pt-14 text-center">
        <h1 className="text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">{t.home.heroTitle}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg text-muted">{t.home.heroSubtitle}</p>
      </section>

      <section id="tools" className="mx-auto max-w-7xl scroll-mt-20 px-4">
        <Suspense>
          <ToolGrid locale={locale} />
        </Suspense>
      </section>

      <section className="mx-auto mt-24 max-w-5xl px-4">
        <h2 className="text-center text-3xl font-extrabold">{t.home.whyTitle}</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {t.home.why.map((w, i) => {
            const Icon = WHY_ICONS[i];
            return (
              <div key={w.title} className="rounded-2xl bg-white p-6 shadow-sm">
                <Icon className="h-8 w-8 text-brand" />
                <h3 className="mt-4 text-lg font-bold">{w.title}</h3>
                <p className="mt-2 text-sm text-muted">{w.text}</p>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
