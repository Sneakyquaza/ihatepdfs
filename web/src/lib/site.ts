import { LOCALES } from "@/i18n";

/** Public origin, used for absolute URLs (sitemap, Open Graph, canonical links). */
export const SITE_URL = (process.env.SITE_URL ?? "https://ihatepdfs.oryx3.fr").replace(/\/$/, "");

/** hreflang alternates for a path without locale prefix ("" for the home page). */
export function alternates(path: string) {
  return Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`]));
}
