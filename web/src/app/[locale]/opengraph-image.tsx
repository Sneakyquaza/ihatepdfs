import { ImageResponse } from "next/og";
import { getDict, isLocale, LOCALES } from "@/i18n";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "iHatePDFs";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

// Social preview card: logo wordmark + localized tagline.
export default async function OgImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getDict(isLocale(locale) ? locale : "fr");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg, #f4f4f7 0%, #ede9fe 100%)", color: "#33333b" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 110, fontWeight: 800 }}>
          i
          <span style={{ position: "relative", display: "flex", margin: "0 16px" }}>
            <svg width="100" height="100" viewBox="0 0 24 24">
              <path fill="#7c3aed" d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.457 5.457 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
            </svg>
            <span style={{ position: "absolute", left: -14, top: 44, width: 128, height: 10, background: "#33333b", transform: "rotate(-25deg)", borderRadius: 5 }} />
          </span>
          PDFs
        </div>
        <div style={{ fontSize: 44, marginTop: 30, maxWidth: 1000, lineHeight: 1.25 }}>{t.home.heroTitle}</div>
        <div style={{ fontSize: 30, marginTop: 24, color: "#6b6b76" }}>ihatepdfs.oryx3.fr</div>
      </div>
    ),
    size,
  );
}
