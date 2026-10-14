"use client";

import { ArrowRight, CheckCircle2, Download, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { Dict, Locale } from "@/i18n";
import { downloadBlob, extOf, formatBytes, type OutputFile, zipOutputs } from "@/lib/files";
import { handOff } from "@/lib/handoff";
import { type Tool, TOOL_MAP } from "@/lib/tools";
import { FileThumb } from "../FileThumb";
import { ToolIcon } from "../ToolIcon";

// Most useful follow-ups per output kind, in display order.
const NEXT_PDF = ["compress-pdf", "sign-pdf", "protect-pdf", "redact-pdf", "merge-pdf", "page-numbers", "watermark-pdf", "organize-pdf", "split-pdf", "rotate-pdf", "pdf-to-jpg", "ocr-pdf"];
const NEXT_IMAGE_FIRST = ["remove-bg"];
const NEXT_IMAGE = ["compress-image", "resize-image", "crop-image", "convert-image", "upscale-image", "blur-image", "watermark-image", "jpg-to-pdf"];

function nextTools(current: Tool, outputs: File[]): Tool[] {
  if (!outputs.length) return [];
  const isPdf = outputs.every((f) => f.type === "application/pdf" || extOf(f.name) === "pdf");
  const isImage = outputs.every((f) => f.type.startsWith("image/"));
  const ids = isPdf ? NEXT_PDF : isImage ? NEXT_IMAGE_FIRST.concat(NEXT_IMAGE) : [];
  return ids
    .map((id) => TOOL_MAP[id])
    .filter((t) => t.id !== current.id)
    .filter((t) => outputs.length === 1 || t.multiple)
    .slice(0, 6);
}

export function ResultView({ tool, outputs, t, locale, onReset }: { tool: Tool; outputs: OutputFile[]; t: Dict; locale: Locale; onReset: () => void }) {
  const router = useRouter();
  // stable File objects: previews key their object URL on the instance
  const files = useMemo(() => outputs.map((o) => new File([o.blob], o.name, { type: o.blob.type })), [outputs]);
  const suggestions = useMemo(() => nextTools(tool, files), [tool, files]);

  const open = (f: File) => {
    const url = URL.createObjectURL(f);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const previewable = (f: File) => f.type === "application/pdf" || f.type.startsWith("image/") || f.type.startsWith("text/");

  return (
    <div className="mt-6 rounded-3xl bg-surface p-6 text-center shadow-sm sm:p-8">
      <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" />
      <h1 className="mt-3 text-3xl font-extrabold">{t.runner.done}</h1>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          onClick={async () => (outputs.length === 1 ? downloadBlob(outputs[0].blob, outputs[0].name) : downloadBlob(await zipOutputs(outputs), `${tool.id}.zip`))}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-8 py-4 text-lg font-bold text-white hover:bg-brand-dark"
        >
          <Download className="h-5 w-5" /> {outputs.length === 1 ? t.runner.download : t.runner.downloadAll}
        </button>
        <button onClick={onReset} className="rounded-xl border border-line px-6 py-4 font-semibold hover:bg-ink/5">
          {t.runner.startOver}
        </button>
      </div>

      <ul className="mt-8 divide-y divide-line text-left">
        {outputs.map((o, i) => (
          <li key={i} className="flex items-center gap-3 py-3">
            {files[i].type === "application/pdf" || files[i].type.startsWith("image/") ? (
              <FileThumb file={files[i]} className="h-14 w-14 shrink-0 rounded-md" />
            ) : (
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-canvas text-xs font-bold uppercase text-muted">{extOf(o.name)}</span>
            )}
            <span className="min-w-0 flex-1 truncate font-medium">{o.name}</span>
            <span className="hidden text-sm text-muted sm:inline">{formatBytes(o.blob.size)}</span>
            {previewable(files[i]) && (
              <button onClick={() => open(files[i])} className="rounded-lg p-2 text-muted hover:bg-ink/5 hover:text-ink" aria-label={`${t.runner.preview} ${o.name}`} title={t.runner.preview}>
                <ExternalLink className="h-5 w-5" />
              </button>
            )}
            <button onClick={() => downloadBlob(o.blob, o.name)} className="rounded-lg p-2 text-accent hover:bg-brand/5" aria-label={`${t.runner.download} ${o.name}`} title={t.runner.download}>
              <Download className="h-5 w-5" />
            </button>
          </li>
        ))}
      </ul>

      {suggestions.length > 0 && (
        <section className="mt-8 text-left">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t.runner.continueWith}</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((next) => (
              <button
                key={next.id}
                onClick={async () => {
                  await handOff(files);
                  const href = `/${locale}/${next.id}`;
                  // intentional full load: that page needs its own CSP (Tool.fullPageLoad)
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  if (next.fullPageLoad) window.location.assign(href);
                  else router.push(href);
                }}
                className="group flex items-center gap-3 rounded-xl border border-line p-3 text-left font-semibold transition hover:border-brand"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${next.color}18`, color: next.color }}>
                  <ToolIcon name={next.icon} className="h-5 w-5" />
                </span>
                <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-tight">{t.tools[next.id as keyof Dict["tools"]].name}</span>
                <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
