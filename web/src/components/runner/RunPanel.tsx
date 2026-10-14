import { AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { fmt, type Dict, type Locale } from "@/i18n";
import type { Options } from "@/lib/files";
import type { Progress } from "@/lib/processors";
import type { Tool } from "@/lib/tools";
import { OptionsForm } from "../OptionsForm";
import { ToolIcon } from "../ToolIcon";

export interface RunError {
  code: string;
  text: string;
}

function progressLabel(p: Progress, t: Dict): string {
  const pct = p.fraction !== undefined ? Math.round(p.fraction * 100) : undefined;
  const label =
    p.phase === "upload" ? (pct === undefined ? t.runner.uploadStart : fmt(t.runner.uploading, { pct }))
    : p.phase === "server" ? t.runner.serverWorking
    : p.phase === "model" && pct !== undefined ? fmt(t.runner.downloadingModel, { pct })
    : t.runner.processing;
  return p.steps ? `${fmt(t.runner.fileOf, { step: p.step ?? 1, steps: p.steps })} · ${label}` : label;
}

export function RunPanel({
  tool, t, locale, opts, setOpts, busy, progress, error, validation, warning, onRun, modeBadge,
}: {
  tool: Tool;
  t: Dict;
  locale: Locale;
  opts: Options;
  setOpts: (o: Options) => void;
  busy: boolean;
  progress: Progress | null;
  error: RunError | null;
  validation: string;
  warning: string;
  onRun: () => void;
  modeBadge: React.ReactNode;
}) {
  const info = t.tools[tool.id as keyof Dict["tools"]];
  return (
    <aside className="flex flex-col gap-5 self-start rounded-3xl bg-surface p-6 shadow-sm lg:sticky lg:top-20">
      <div>
        <h2 className="text-xl font-extrabold">{info.name}</h2>
        <div className="mt-1">{modeBadge}</div>
      </div>
      {tool.options?.length ? <OptionsForm defs={tool.options} values={opts} onChange={setOpts} t={t} /> : null}
      {warning && (
        <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {warning}
        </p>
      )}
      {error && (
        <div role="alert" className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-bold">{t.runner.error}</p>
            <p className="break-words">{error.text}</p>
            {error.code === "encrypted" && tool.id !== "unlock-pdf" && (
              <Link href={`/${locale}/unlock-pdf`} className="mt-2 inline-block font-bold underline">
                {t.errors.unlockCta} →
              </Link>
            )}
          </div>
        </div>
      )}
      {validation && <p className="text-sm text-muted">{validation}</p>}
      <button
        onClick={onRun}
        disabled={busy || Boolean(validation)}
        className="flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-4 text-lg font-bold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        {busy ? t.runner.processing : info.name}
        {!busy && <ToolIcon name={tool.icon} className="h-5 w-5" />}
      </button>
      {busy && progress && (
        <div aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-canvas">
            {progress.fraction !== undefined ? (
              <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
            ) : (
              <div className="progress-indeterminate h-full w-2/5 rounded-full bg-brand" />
            )}
          </div>
          <p className="mt-2 text-xs text-muted">{progressLabel(progress, t)}</p>
        </div>
      )}
      {tool.id === "remove-bg" && <p className="text-xs text-muted">{t.runner.firstRunModel}</p>}
    </aside>
  );
}
