"use client";

import { ArrowLeft, Loader2, Monitor, Server } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmt, getDict, type Locale } from "@/i18n";
import type { EditorData } from "@/lib/editorTypes";
import { AppError } from "@/lib/errors";
import { downloadBlob, extOf, type Options, type OutputFile } from "@/lib/files";
import { takeHandOff } from "@/lib/handoff";
import { heicToJpeg, isHeicFile } from "@/lib/heic";
import { pushRecent } from "@/lib/prefs";
import { type Progress, runTool } from "@/lib/processors";
import { CLIENT_WARN_MB, defaultOptions, SERVER_MAX_MB, type Tool, TOOL_MAP } from "@/lib/tools";
import { useWindowDrop } from "@/lib/useWindowDrop";
import { FileGrid } from "./runner/FileGrid";
import { ResultView } from "./runner/ResultView";
import { type RunError, RunPanel } from "./runner/RunPanel";
import { DropOverlay, UploadHero } from "./runner/UploadHero";

const editorLoading = () => (
  <div className="grid h-64 place-items-center">
    <Loader2 className="h-8 w-8 animate-spin text-muted" />
  </div>
);
const EDITORS = {
  organize: dynamic(() => import("./editors/OrganizeEditor"), { ssr: false, loading: editorLoading }),
  sign: dynamic(() => import("./editors/SignEditor"), { ssr: false, loading: editorLoading }),
  edit: dynamic(() => import("./editors/EditPdfEditor"), { ssr: false, loading: editorLoading }),
  crop: dynamic(() => import("./editors/CropEditor"), { ssr: false, loading: editorLoading }),
  redact: dynamic(() => import("./editors/RedactEditor"), { ssr: false, loading: editorLoading }),
  form: dynamic(() => import("./editors/FormEditor"), { ssr: false, loading: editorLoading }),
  regions: dynamic(() => import("./editors/RegionsEditor"), { ssr: false, loading: editorLoading }),
};

function accepts(accept: string, file: File): boolean {
  const ext = `.${extOf(file.name)}`;
  return accept.split(",").some((a) => {
    a = a.trim().toLowerCase();
    return a.startsWith(".") ? a === ext : a.endsWith("/*") ? file.type.startsWith(a.slice(0, -1)) : a === file.type;
  });
}

function limitFiles(tool: Tool, files: File[]): File[] {
  const valid = files.filter((f) => accepts(tool.accept, f));
  return tool.multiple ? valid.slice(0, tool.maxFiles ?? valid.length) : valid.slice(0, 1);
}

type Status = "idle" | "processing" | "done";

export function ToolRunner({ toolId, locale }: { toolId: string; locale: Locale }) {
  const tool = TOOL_MAP[toolId];
  const t = getDict(locale);
  const minFiles = tool.minFiles ?? 1;

  const [files, setFiles] = useState<File[]>([]);
  const [opts, setOpts] = useState<Options>(() => defaultOptions(tool, t.defaults));
  const [editorData, setEditorData] = useState<EditorData>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [error, setError] = useState<RunError | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [converting, setConverting] = useState(false);

  // single intake point (picker, drop, hand-off): HEIC/HEIF photos become plain JPEGs here
  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      let incoming = Array.from(list).filter((f) => accepts(tool.accept, f));
      setError(null);
      try {
        const heic = await Promise.all(incoming.map(isHeicFile));
        if (heic.some(Boolean)) {
          setConverting(true);
          incoming = await Promise.all(incoming.map((f, i) => (heic[i] ? heicToJpeg(f) : f)));
        }
      } catch (e) {
        const errors = t.errors as Record<string, string>;
        if (e instanceof AppError && errors[e.code]) setError({ code: e.code, text: fmt(errors[e.code], e.params) });
        return;
      } finally {
        setConverting(false);
      }
      setFiles((prev) => limitFiles(tool, tool.multiple ? [...prev, ...incoming] : incoming));
      setEditorData(null);
    },
    [tool, t],
  );
  const dragging = useWindowDrop(addFiles, status !== "done");

  // files handed over by "continue with…" on the previous tool's result screen
  useEffect(() => {
    let alive = true;
    takeHandOff().then((handed) => {
      if (alive && handed) void addFiles(handed);
    });
    return () => {
      alive = false;
    };
  }, [addFiles]);

  const move = (i: number, d: -1 | 1) =>
    setFiles((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const reset = () => {
    setFiles([]);
    setOutputs([]);
    setEditorData(null);
    setStatus("idle");
    setError(null);
  };

  const totalMb = files.reduce((n, f) => n + f.size, 0) / 1024 / 1024;
  const tooBig = tool.mode === "server" && files.find((f) => f.size > SERVER_MAX_MB * 1024 * 1024);
  const validation = (() => {
    if (tooBig) return fmt(t.errors.file_too_large, { max: SERVER_MAX_MB });
    if (tool.id === "html-to-pdf") return files.length || String(opts.url).trim() ? "" : t.runner.needUrlOrFile;
    if (files.length < minFiles) return fmt(t.runner.needFiles, { n: minFiles });
    if (tool.maxFiles && files.length > tool.maxFiles) return fmt(t.runner.maxFiles, { n: tool.maxFiles });
    return "";
  })();
  const warning = tool.mode === "client" && totalMb > CLIENT_WARN_MB ? t.runner.bigFileWarning : "";

  const run = async () => {
    setStatus("processing");
    setProgress({ phase: tool.mode === "server" ? "upload" : "work" });
    setError(null);
    try {
      const out = await runTool(tool, files, opts, { editorData, onProgress: setProgress });
      setOutputs(out);
      setStatus("done");
      pushRecent(tool.id);
      if (out.length === 1) downloadBlob(out[0].blob, out[0].name);
    } catch (e) {
      console.error(e);
      const errors = t.errors as Record<string, string>;
      if (e instanceof AppError && errors[e.code]) setError({ code: e.code, text: fmt(errors[e.code], e.params) });
      else setError({ code: "processing_failed", text: errors.processing_failed });
      setStatus("idle");
    } finally {
      setProgress(null);
    }
  };

  const modeBadge = (
    <p className="flex items-center gap-1.5 text-xs text-muted">
      {tool.mode === "client" ? <Monitor className="h-3.5 w-3.5" /> : <Server className="h-3.5 w-3.5" />}
      {tool.mode === "client" ? t.runner.local : t.runner.server}
    </p>
  );
  const backLink = (
    <Link href={`/${locale}`} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" /> {t.nav.allTools}
    </Link>
  );
  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      hidden
      accept={tool.accept}
      multiple={tool.multiple}
      onChange={(e) => {
        if (e.target.files) addFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );
  const pick = () => inputRef.current?.click();

  if (status === "done") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        {backLink}
        <ResultView tool={tool} outputs={outputs} t={t} locale={locale} onReset={reset} />
      </div>
    );
  }

  if (!files.length && minFiles > 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        {backLink}
        {converting && (
          <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> {t.runner.convertingHeic}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error.text}
          </p>
        )}
        <UploadHero tool={tool} t={t} onPick={pick} modeBadge={modeBadge} />
        {fileInput}
        {dragging && <DropOverlay t={t} />}
      </div>
    );
  }

  const Editor = tool.editor ? EDITORS[tool.editor] : null;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {backLink}
      {converting && (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> {t.runner.convertingHeic}
        </p>
      )}
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="min-w-0 rounded-3xl bg-surface p-4 shadow-sm sm:p-6">
          {Editor ? (
            // remount on new files so editors start from a clean state
            <Editor key={files.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join("|")} files={files} onChange={setEditorData} t={t} />
          ) : (
            <FileGrid
              tool={tool}
              files={files}
              t={t}
              onMove={move}
              onRemove={(i) => {
                setFiles((prev) => prev.filter((_, k) => k !== i));
                setEditorData(null);
              }}
              onAdd={pick}
            />
          )}
        </section>
        <RunPanel
          tool={tool}
          t={t}
          locale={locale}
          opts={opts}
          setOpts={setOpts}
          busy={status === "processing"}
          progress={progress}
          error={error}
          validation={validation}
          warning={warning}
          onRun={run}
          modeBadge={modeBadge}
        />
      </div>
      {fileInput}
      {dragging && <DropOverlay t={t} />}
    </div>
  );
}
