"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FormFillData } from "@/lib/editorTypes";
import { AppError } from "@/lib/errors";
import type { FormFieldInfo, FormValue } from "@/lib/formFields";
import { type EditorProps, EditorError, PageNav, PdfPage, usePdfDoc } from "./shared";

/** Real HTML controls laid over each AcroForm widget; only the fields the user changed are emitted. */
export default function FormEditor({ files, onChange, t }: EditorProps<FormFillData>) {
  const { locale } = useParams<{ locale: string }>();
  const { doc, error: pdfError } = usePdfDoc(files[0]);
  const [fields, setFields] = useState<FormFieldInfo[]>([]);
  const [readError, setReadError] = useState<unknown>(null);
  const [values, setValues] = useState<Record<string, FormValue>>({});
  const [page, setPage] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { PDFDocument } = await import("pdf-lib");
      const { readFormFields } = await import("@/lib/formFields");
      const pdf = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
      if (pdf.isEncrypted) throw new AppError("encrypted", { name: files[0].name });
      return readFormFields(pdf, files[0].name);
    })()
      .then((f) => alive && setFields(f))
      .catch((e) => alive && setReadError(e instanceof AppError ? e : new AppError("invalid_pdf", { name: files[0].name })));
    return () => {
      alive = false;
    };
  }, [files]);

  const initial = useMemo(() => Object.fromEntries(fields.map((f) => [f.name, f.value])), [fields]);
  useEffect(() => {
    const changed: FormFillData["values"] = {};
    for (const [k, v] of Object.entries(values)) if (JSON.stringify(v) !== JSON.stringify(initial[k])) changed[k] = v;
    onChange({ values: changed });
  }, [values, initial, onChange]);

  const set = (name: string, v: FormValue) => setValues((all) => ({ ...all, [name]: v }));
  const get = (f: FormFieldInfo): FormValue => values[f.name] ?? f.value;

  // top-to-bottom, then left-to-right: this is the DOM (= tab) order
  const onPage = useMemo(
    () =>
      fields
        .flatMap((f) => f.widgets.map((w) => ({ f, w })))
        .filter(({ w }) => w.page === page)
        .sort((a, b) => a.w.y - b.w.y || a.w.x - b.w.x),
    [fields, page],
  );

  const err = readError ?? pdfError;
  const noFields = err instanceof AppError && (err.code === "no_form_fields" || err.code === "xfa_form");

  return (
    <div className="min-w-0 space-y-3 rounded-2xl bg-canvas p-4">
      <p className="text-sm text-muted">{t.editors.formHint}</p>
      <EditorError error={err} t={t} />
      {noFields && (
        <Link href={`/${locale}/edit-pdf`} className="inline-block text-sm font-bold text-accent underline">
          {t.errors.editCta} →
        </Link>
      )}
      {doc && fields.length > 0 && <PageNav page={page} count={doc.numPages} setPage={setPage} t={t} />}
      {doc && fields.length > 0 && (
        <PdfPage doc={doc} pageIndex={page}>
          {(g) =>
            onPage.map(({ f, w }, i) => {
              const px = Math.max(8, Math.min(18, w.h * g.cssH * 0.6));
              const val = get(f);
              const common = "block h-full w-full rounded-sm border border-blue-400 bg-blue-50/80 px-1 text-neutral-900 outline-none focus:border-brand focus:bg-white disabled:cursor-not-allowed disabled:opacity-60";
              let control: React.ReactNode;
              if (f.kind === "check")
                control = <input type="checkbox" aria-label={f.name} disabled={f.readOnly} checked={val === true} onChange={(e) => set(f.name, e.target.checked)} className="block h-full w-full cursor-pointer accent-brand" />;
              else if (f.kind === "radio")
                control = <input type="radio" name={f.name} aria-label={`${f.name}: ${w.option ?? ""}`} disabled={f.readOnly} checked={val === w.option} onChange={() => w.option !== undefined && set(f.name, w.option)} className="block h-full w-full cursor-pointer accent-brand" />;
              else if (f.kind === "dropdown" || f.kind === "list")
                control = (
                  <select
                    aria-label={f.name}
                    disabled={f.readOnly}
                    multiple={f.multiSelect || f.kind === "list"}
                    value={f.multiSelect ? (val as string[]) : (Array.isArray(val) ? val[0] ?? "" : (val as string))}
                    onChange={(e) => set(f.name, f.multiSelect ? [...e.target.selectedOptions].map((o) => o.value) : e.target.value)}
                    className={common}
                    style={{ fontSize: px }}
                  >
                    {f.kind === "dropdown" && <option value="" />}
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                );
              else if (f.multiline)
                control = <textarea aria-label={f.name} disabled={f.readOnly} maxLength={f.maxLength} value={val as string} onChange={(e) => set(f.name, e.target.value)} className={`${common} resize-none py-0.5`} style={{ fontSize: px }} />;
              else
                control = <input type="text" aria-label={f.name} disabled={f.readOnly} maxLength={f.maxLength} value={val as string} onChange={(e) => set(f.name, e.target.value)} className={common} style={{ fontSize: px }} />;
              return (
                <div key={`${f.name}:${i}`} className="absolute" style={{ left: `${w.x * 100}%`, top: `${w.y * 100}%`, width: `${w.w * 100}%`, height: `${w.h * 100}%` }}>
                  {control}
                </div>
              );
            })
          }
        </PdfPage>
      )}
    </div>
  );
}
