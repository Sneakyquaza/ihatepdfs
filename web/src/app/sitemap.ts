import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n";
import { alternates, SITE_URL } from "@/lib/site";
import { TOOLS } from "@/lib/tools";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", ...TOOLS.map((t) => `/${t.id}`), "/legal", "/privacy"];
  return paths.flatMap((path) =>
    LOCALES.map((l) => ({
      url: `${SITE_URL}/${l}${path}`,
      changeFrequency: "monthly" as const,
      priority: path === "" ? 1 : path.startsWith("/legal") || path.startsWith("/privacy") ? 0.2 : 0.8,
      alternates: { languages: alternates(path) },
    })),
  );
}
