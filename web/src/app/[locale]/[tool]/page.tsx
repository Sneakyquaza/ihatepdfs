import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolRunner } from "@/components/ToolRunner";
import { getDict, isLocale, LOCALES } from "@/i18n";
import { TOOL_MAP, TOOLS } from "@/lib/tools";

type Params = Promise<{ locale: string; tool: string }>;

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => TOOLS.map((t) => ({ locale, tool: t.id })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, tool } = await params;
  if (!isLocale(locale) || !TOOL_MAP[tool]) return {};
  const { name, desc } = getDict(locale).tools[tool as keyof ReturnType<typeof getDict>["tools"]];
  return {
    title: `${name} — iHatePDFs`,
    description: desc,
    alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/${tool}`])) },
  };
}

export default async function ToolPage({ params }: { params: Params }) {
  const { locale, tool } = await params;
  if (!isLocale(locale) || !TOOL_MAP[tool]) notFound();
  return <ToolRunner toolId={tool} locale={locale} />;
}
