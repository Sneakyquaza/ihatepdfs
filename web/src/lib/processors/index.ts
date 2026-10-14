import type { EditorData } from "../editorTypes";
import { AppError } from "../errors";
import { baseName, type Options, type OutputFile } from "../files";
import type { Tool } from "../tools";

/** phase drives the label; fraction (0..1) the bar, absent = indeterminate; step/steps for batches. */
export interface Progress {
  phase: "upload" | "server" | "model" | "work";
  fraction?: number;
  step?: number;
  steps?: number;
}

export interface RunContext {
  editorData: EditorData;
  onProgress?: (p: Progress) => void;
}

type Processor = (files: File[], opts: Options, ctx: RunContext) => Promise<OutputFile[]>;

const pdf = () => import("./pdf");
const img = () => import("./image");

// Each processor module is loaded lazily so a tool page only ships the code it needs.
const CLIENT: Record<string, Processor> = {
  "merge-pdf": async (f) => (await pdf()).mergePdf(f),
  "split-pdf": async (f, o) => (await pdf()).splitPdf(f, o),
  "remove-pages": async (f, o) => (await pdf()).removePages(f, o),
  "extract-pages": async (f, o) => (await pdf()).extractPages(f, o),
  "organize-pdf": async (f, o, c) => (await pdf()).organizePdf(f, o, c.editorData as never),
  "rotate-pdf": async (f, o) => (await pdf()).rotatePdf(f, o),
  "page-numbers": async (f, o) => (await pdf()).pageNumbers(f, o),
  "watermark-pdf": async (f, o) => (await pdf()).watermarkPdf(f, o),
  "sign-pdf": async (f, o, c) => (await pdf()).signPdf(f, o, c.editorData as never),
  "edit-pdf": async (f, o, c) => (await pdf()).editPdf(f, o, c.editorData as never),
  "pdf-to-jpg": async (f, o) => (await pdf()).pdfToImages(f, o),
  "jpg-to-pdf": async (f, o) => (await pdf()).imagesToPdf(f, o),
  "crop-pdf": async (f, o, c) => (await pdf()).cropPdf(f, o, c.editorData as never),
  "pdf-to-text": async (f) => (await pdf()).pdfToText(f),
  "n-up-pdf": async (f, o) => (await pdf()).nUpPdf(f, o),
  "edit-metadata": async (f, o) => (await pdf()).editMetadata(f, o),
  "remove-bg": async (f, o, c) => (await img()).removeBg(f, o, c.onProgress),
  "resize-image": async (f, o) => (await img()).resizeImage(f, o),
  "crop-image": async (f, o, c) => (await img()).cropImage(f, o, c.editorData as never),
  "compress-image": async (f, o) => (await img()).compressImage(f, o),
  "convert-image": async (f, o) => (await img()).convertImage(f, o),
  "rotate-image": async (f, o) => (await img()).rotateImage(f, o),
  "watermark-image": async (f, o) => (await img()).watermarkImage(f, o),
  "blur-image": async (f, o, c) => (await img()).blurImage(f, o, c.editorData as never),
};

function filenameFrom(header: string | null, fallback: string): string {
  const cd = header ?? "";
  const star = cd.match(/filename\*=(?:UTF-8|utf-8)''([^;]+)/);
  if (star) return decodeURIComponent(star[1]);
  const plain = cd.match(/filename="?([^";]+)"?/);
  return plain ? plain[1] : fallback;
}

/** XHR rather than fetch: fetch can't report upload progress. */
function post(
  endpoint: string,
  form: FormData,
  fallbackName: string,
  onProgress?: (p: Progress) => void,
  batch: Pick<Progress, "step" | "steps"> = {},
): Promise<OutputFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/${endpoint}`);
    xhr.responseType = "blob";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.({ phase: "upload", fraction: e.loaded / e.total, ...batch });
    };
    xhr.upload.onload = () => onProgress?.({ phase: "server", ...batch });
    xhr.onerror = () => reject(new AppError("network"));
    xhr.onload = async () => {
      const blob = xhr.response as Blob;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ name: filenameFrom(xhr.getResponseHeader("Content-Disposition"), fallbackName), blob });
        return;
      }
      // API errors are {detail: {code, message, params?}}; anything else (proxy page, crash) gets a generic code
      let detail: { code?: string; message?: string; params?: Record<string, string | number> } | undefined;
      try {
        const body = JSON.parse(await blob.text());
        detail = typeof body?.detail === "object" ? body.detail : undefined;
      } catch {
        /* non-JSON error body */
      }
      const s = xhr.status;
      const fallback = s === 413 ? "file_too_large" : s === 429 ? "rate_limited" : s === 503 ? "busy" : s === 504 ? "timeout" : "processing_failed";
      reject(new AppError(detail?.code ?? fallback, detail?.params ?? {}, detail?.message));
    };
    xhr.send(form);
  });
}

function withOptions(form: FormData, opts: Options) {
  for (const [k, v] of Object.entries(opts)) if (v !== "" && v !== undefined) form.append(k, String(v));
  return form;
}

async function runServer(tool: Tool, files: File[], opts: Options, ctx: RunContext): Promise<OutputFile[]> {
  const endpoint = tool.endpoint!;
  // visual editor output travels as a JSON form field named "editor"
  if (tool.editor && ctx.editorData != null) opts = { ...opts, editor: JSON.stringify(ctx.editorData) };
  if (tool.serverInput === "pair") {
    const form = withOptions(new FormData(), opts);
    form.append("file_a", files[0]);
    form.append("file_b", files[1]);
    return [await post(endpoint, form, "result.pdf", ctx.onProgress)];
  }
  if (!files.length) return [await post(endpoint, withOptions(new FormData(), opts), "result.pdf", ctx.onProgress)];
  const outs: OutputFile[] = [];
  for (const [i, f] of files.entries()) {
    const batch = files.length > 1 ? { step: i + 1, steps: files.length } : {};
    const form = withOptions(new FormData(), opts);
    form.append("file", f);
    outs.push(await post(endpoint, form, `${baseName(f.name)}.pdf`, ctx.onProgress, batch));
  }
  return outs;
}

export async function runTool(tool: Tool, files: File[], opts: Options, ctx: RunContext): Promise<OutputFile[]> {
  if (tool.mode === "server") return runServer(tool, files, opts, ctx);
  const proc = CLIENT[tool.id];
  if (!proc) throw new AppError("processing_failed", {}, `No processor for ${tool.id}`);
  return proc(files, opts, ctx);
}
