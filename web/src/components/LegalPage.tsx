import { Fragment } from "react";
import type { LegalDoc } from "@/i18n/legal";

const LINK = /(https:\/\/[^\s)]+|[\w.+-]+@[\w-]+\.[\w.]+)/g;

/** Renders a paragraph, turning bare emails and https URLs into links. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(LINK);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{p}</Fragment>;
        const href = p.includes("@") && !p.startsWith("http") ? `mailto:${p}` : p;
        return (
          <a key={i} href={href} className="font-medium text-accent underline" rel="noopener">
            {p}
          </a>
        );
      })}
    </>
  );
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-extrabold tracking-tight">{doc.title}</h1>
      <p className="mt-2 text-sm text-muted">{doc.updated}</p>
      <div className="mt-8 space-y-8 rounded-3xl bg-surface p-6 shadow-sm sm:p-8">
        {doc.sections.map((s) => (
          <section key={s.title}>
            <h2 className="text-lg font-bold">{s.title}</h2>
            {s.body.map((para, i) => (
              <p key={i} className="mt-2 leading-relaxed text-muted">
                <Linkified text={para} />
              </p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
