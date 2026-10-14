"use client";

import {
  AlertCircle, ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Download, Loader2, Monitor, Plus, Server, Upload, X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmt, getDict, type Locale } from "@/i18n";
import type { EditorData } from "@/lib/editorTypes";
import { downloadBlob, extOf, formatBytes, type Options, type OutputFile, zipOutputs } from "@/lib/files";
import { pushRecent } from "@/lib/prefs";
import { runTool } from "@/lib/processors";
import { defaultOptions, TOOL_MAP } from "@/lib/tools";
import { FileThumb } from "./FileThumb";
import { OptionsForm } from "./OptionsForm";
import { ToolIcon } from "./ToolIcon";

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
  regions: dynamic(() => import("./editors/RegionsEditor"), { ssr: false, loading: editorLoading }),
};

function accepts(accept: string, file: File): boolean {
  const ext = `.${extOf(file.name)}`;
  return accept.split(",").some((a) => {
    a = a.trim().toLowerCase();
    return a.startsWith(".") ? a === ext : a.endsWith("/*") ? file.type.startsWith(a.slice(0, -1)) : a === file.type;
  });
}

type Status = "idle" | "processing" | "done" | "error";

export function ToolRunner({ toolId, locale }: { toolId: string; locale: Locale }) {
  const tool = TOOL_MAP[toolId];
  const t = getDict(locale);
  const info = t.tools[toolId as keyof typeof t.tools];
  const minFiles = tool.minFiles ?? 1;

  const [files, setFiles] = useState<File[]>([]);
  const [opts, setOpts] = useState<Options>(() => defaultOptions(tool));
  const [editorData, setEditorData] = useState<EditorData>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState("");
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const valid = Array.from(list).filter((f) => accepts(tool.accept, f));
      if (!valid.length) return;
      setFiles((prev) => {
        const next = tool.multiple ? [...prev, ...valid] : [valid[0]];
        return tool.maxFiles ? next.slice(0, tool.maxFiles) : next;
      });
      setEditorData(null);
      setStatus("idle");
      setError("");
    },
    [tool],
  );

  // Whole-window drag & drop
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [addFiles]);

  const move = (i: number, d: -1 | 1) =>
    setFiles((prev) => {
      const next = [...prev];
      const j = i + d;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const removeAt = (i: number) => {
    setFiles((prev) => prev.filter((_, k) => k !== i));
    setEditorData(null);
  };

  const reset = () => {
    setFiles([]);
    setOutputs([]);
    setEditorData(null);
    setStatus("idle");
    setError("");
  };

  const validation = (() => {
    if (tool.id === "html-to-pdf") return files.length || String(opts.url).trim() ? "" : fmt(t.runner.needFiles, { n: 1 });
    if (files.length < minFiles) return fmt(t.runner.needFiles, { n: minFiles });
    if (tool.maxFiles && files.length > tool.maxFiles) return fmt(t.runner.maxFiles, { n: tool.maxFiles });
    return "";
  })();

  const run = async () => {
    setStatus("processing");
    setProgress("");
    setError("");
    try {
      const out = await runTool(tool, files, opts, { editorData, onProgress: setProgress });
      setOutputs(out);
      setStatus("done");
      pushRecent(tool.id);
      if (out.length === 1) downloadBlob(out[0].blob, out[0].name);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg === "HTTP_429" ? t.runner.tooMany : msg === "HTTP_503" ? t.runner.busy : msg);
      setStatus("error");
    }
  };

  const downloadAll = async () => {
    downloadBlob(await zipOutputs(outputs), `${tool.id}.zip`);
  };

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

  const dropOverlay = dragging && status !== "done" && (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-brand/10 backdrop-blur-sm">
      <div className="rounded-3xl border-4 border-dashed border-brand bg-white/90 px-16 py-12 text-center">
        <Upload className="mx-auto h-12 w-12 text-brand" />
        <p className="mt-3 text-lg font-bold">{t.runner.drop}</p>
      </div>
    </div>
  );

  const header = (
    <div className="text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: `${tool.color}18`, color: tool.color }}>
        <ToolIcon name={tool.icon} className="h-7 w-7" />
      </span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{info.name}</h1>
      <p className="mx-auto mt-2 max-w-xl text-muted">{info.desc}</p>
    </div>
  );

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

  // ---------- Done ----------
  if (status === "done") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        {backLink}
        <div className="mt-6 rounded-3xl bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" />
          <h1 className="mt-3 text-3xl font-extrabold">{t.runner.done}</h1>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {outputs.length === 1 ? (
              <button onClick={() => downloadBlob(outputs[0].blob, outputs[0].name)} className="inline-flex items-center gap-2 rounded-xl bg-brand px-8 py-4 text-lg font-bold text-white hover:bg-brand-dark">
                <Download className="h-5 w-5" /> {t.runner.download}
              </button>
            ) : (
              <button onClick={downloadAll} className="inline-flex items-center gap-2 rounded-xl bg-brand px-8 py-4 text-lg font-bold text-white hover:bg-brand-dark">
                <Download className="h-5 w-5" /> {t.runner.downloadAll}
              </button>
            )}
            <button onClick={reset} className="rounded-xl border border-black/10 px-6 py-4 font-semibold hover:bg-black/5">
              {t.runner.startOver}
            </button>
          </div>
          <ul className="mt-8 divide-y divide-black/5 text-left">
            {outputs.map((o, i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                {o.blob.type.startsWith("image/") ? (
                  <FileThumb file={new File([o.blob], o.name, { type: o.blob.type })} className="h-12 w-12 rounded-md" />
                ) : (
                  <span className="grid h-12 w-12 place-items-center rounded-md bg-canvas text-xs font-bold uppercase text-muted">{extOf(o.name)}</span>
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{o.name}</span>
                <span className="text-sm text-muted">{formatBytes(o.blob.size)}</span>
                <button onClick={() => downloadBlob(o.blob, o.name)} className="rounded-lg p-2 text-brand hover:bg-brand/5" aria-label={t.runner.download}>
                  <Download className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // ---------- Empty: big upload hero ----------
  if (!files.length && minFiles > 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        {backLink}
        <div className="mt-6">{header}</div>
        <div className="mt-10 flex flex-col items-center">
          <button
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-3 rounded-2xl bg-brand px-10 py-5 text-xl font-bold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-dark"
          >
            <Upload className="h-6 w-6" />
            {tool.multiple ? t.runner.select : t.runner.selectOne}
          </button>
          <p className="mt-3 text-sm text-muted">{t.runner.drop}</p>
          <div className="mt-6">{modeBadge}</div>
          {tool.id === "remove-bg" && <p className="mt-2 text-xs text-muted">{t.runner.firstRunModel}</p>}
        </div>
        {fileInput}
        {dropOverlay}
      </div>
    );
  }

  // ---------- Workspace ----------
  const Editor = tool.editor ? EDITORS[tool.editor] : null;
  const busy = status === "processing";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {backLink}
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="min-w-0 rounded-3xl bg-white p-4 shadow-sm sm:p-6">
          {Editor ? (
            <Editor files={files} onChange={setEditorData} t={t} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="group relative rounded-2xl bg-canvas p-3">
                  <FileThumb file={f} className="aspect-[3/4] rounded-lg" />
                  <p className="mt-2 truncate text-xs font-semibold" title={f.name}>{f.name}</p>
                  <p className="text-xs text-muted">{formatBytes(f.size)}</p>
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                    {tool.multiple && files.length > 1 && (
                      <>
                        <button onClick={() => move(i, -1)} className="rounded-full bg-white p-1 shadow" aria-label={t.runner.moveUp}><ChevronUp className="h-4 w-4" /></button>
                        <button onClick={() => move(i, 1)} className="rounded-full bg-white p-1 shadow" aria-label={t.runner.moveDown}><ChevronDown className="h-4 w-4" /></button>
                      </>
                    )}
                    <button onClick={() => removeAt(i)} className="rounded-full bg-white p-1 text-brand shadow" aria-label={t.runner.remove}><X className="h-4 w-4" /></button>
                  </div>
                  {tool.multiple && files.length > 1 && (
                    <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
                  )}
                </div>
              ))}
              {(tool.multiple || !files.length) && (!tool.maxFiles || files.length < tool.maxFiles) && (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="grid aspect-[3/4] place-items-center rounded-2xl border-2 border-dashed border-black/15 text-muted transition hover:border-brand hover:text-brand"
                >
                  <span className="flex flex-col items-center gap-2 text-sm font-semibold">
                    <Plus className="h-8 w-8" />
                    {files.length ? t.runner.addMore : t.runner.selectOne}
                  </span>
                </button>
              )}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-5 self-start rounded-3xl bg-white p-6 shadow-sm lg:sticky lg:top-20">
          <div>
            <h2 className="text-xl font-extrabold">{info.name}</h2>
            <div className="mt-1">{modeBadge}</div>
          </div>
          {tool.options?.length ? <OptionsForm defs={tool.options} values={opts} onChange={setOpts} t={t} /> : null}
          {status === "error" && (
            <div className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-bold">{t.runner.error}</p>
                <p className="break-words">{error}</p>
              </div>
            </div>
          )}
          {validation && <p className="text-sm text-muted">{validation}</p>}
          <button
            onClick={run}
            disabled={busy || Boolean(validation)}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-4 text-lg font-bold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> {t.runner.processing} {progress}
              </>
            ) : (
              <>
                {info.name} <ToolIcon name={tool.icon} className="h-5 w-5" />
              </>
            )}
          </button>
          {tool.id === "remove-bg" && <p className="text-xs text-muted">{t.runner.firstRunModel}</p>}
        </aside>
      </div>
      {fileInput}
      {dropOverlay}
    </div>
  );
}
