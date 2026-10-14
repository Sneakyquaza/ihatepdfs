import type { EditorData } from "../editorTypes";
import { AppError } from "../errors";
import { baseName, type Options, type OutputFile } from "../files";
import type { Tool } from "../tools";

export interface RunContext {
  editorData: EditorData;
  onProgress?: (msg: string) => void;
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

function filenameFrom(res: Response, fallback: string): string {
  const cd = res.headers.get("Content-Disposition") ?? "";
  const star = cd.match(/filename\*=(?:UTF-8|utf-8)''([^;]+)/);
  if (star) return decodeURIComponent(star[1]);
  const plain = cd.match(/filename="?([^";]+)"?/);
  return plain ? plain[1] : fallback;
}

async function post(endpoint: string, form: FormData, fallbackName: string): Promise<OutputFile> {
  let res: Response;
  try {
    res = await fetch(`/api/${endpoint}`, { method: "POST", body: form });
  } catch {
    throw new AppError("network");
  }
  if (!res.ok) {
    // API errors are {detail: {code, message, params?}}; anything else (proxy page, crash) gets a generic code
    let detail: { code?: string; message?: string; params?: Record<string, string | number> } | undefined;
    try {
      const body = await res.json();
      detail = typeof body?.detail === "object" ? body.detail : undefined;
    } catch {
      /* non-JSON error body */
    }
    const fallback = res.status === 413 ? "file_too_large" : res.status === 429 ? "rate_limited" : res.status === 503 ? "busy" : res.status === 504 ? "timeout" : "processing_failed";
    throw new AppError(detail?.code ?? fallback, detail?.params ?? {}, detail?.message);
  }
  return { name: filenameFrom(res, fallbackName), blob: await res.blob() };
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
    return [await post(endpoint, form, "result.pdf")];
  }
  if (!files.length) return [await post(endpoint, withOptions(new FormData(), opts), "result.pdf")];
  const outs: OutputFile[] = [];
  for (const [i, f] of files.entries()) {
    if (files.length > 1) ctx.onProgress?.(`${i + 1} / ${files.length}`);
    const form = withOptions(new FormData(), opts);
    form.append("file", f);
    outs.push(await post(endpoint, form, `${baseName(f.name)}.pdf`));
  }
  return outs;
}

export async function runTool(tool: Tool, files: File[], opts: Options, ctx: RunContext): Promise<OutputFile[]> {
  if (tool.mode === "server") return runServer(tool, files, opts, ctx);
  const proc = CLIENT[tool.id];
  if (!proc) throw new AppError("processing_failed", {}, `No processor for ${tool.id}`);
  return proc(files, opts, ctx);
}
