export type Category =
  | "organize"
  | "optimize"
  | "convert-to"
  | "convert-from"
  | "edit"
  | "security"
  | "image";

export const CATEGORIES: Category[] = ["organize", "optimize", "convert-to", "convert-from", "edit", "security", "image"];

type Base = { key: string; showIf?: { key: string; equals: string | string[] } };
export type OptionDef =
  | (Base & { type: "select"; options: string[]; default: string })
  | (Base & { type: "number"; min?: number; max?: number; step?: number; default: number })
  | (Base & { type: "range"; min: number; max: number; step: number; default: number; unit?: string })
  | (Base & { type: "text"; default: string; placeholder?: string; password?: boolean })
  | (Base & { type: "color"; default: string })
  | (Base & { type: "checkbox"; default: boolean });

export type Editor = "organize" | "sign" | "edit" | "crop" | "redact" | "regions";

export interface Tool {
  id: string;
  category: Category;
  icon: string; // lucide icon name, resolved in ToolIcon
  color: string; // accent color (hex)
  accept: string; // <input accept>
  multiple: boolean;
  minFiles?: number; // default 1
  maxFiles?: number;
  mode: "client" | "server";
  endpoint?: string; // server: POST /api/<endpoint>
  /** server: how files are sent. "each" = one request per file (default), "pair" = file_a/file_b */
  serverInput?: "each" | "pair";
  options?: OptionDef[];
  editor?: Editor;
}

const PDF = "application/pdf,.pdf";
const IMG = "image/png,image/jpeg,image/webp,image/bmp,.png,.jpg,.jpeg,.webp,.bmp";

const C = {
  brand: "#7c3aed",
  orange: "#f08c00",
  green: "#2f9e44",
  blue: "#1c7ed6",
  indigo: "#4263eb",
  pink: "#d6336c",
  teal: "#0c8599",
  gray: "#495057",
};

const pagesOpt: OptionDef = { type: "text", key: "pages", default: "", placeholder: "1,3-5" };

export const TOOLS: Tool[] = [
  // ---------- Organize ----------
  { id: "merge-pdf", category: "organize", icon: "Combine", color: C.brand, accept: PDF, multiple: true, minFiles: 2, mode: "client" },
  {
    id: "split-pdf", category: "organize", icon: "Scissors", color: C.brand, accept: PDF, multiple: false, mode: "client",
    options: [
      { type: "select", key: "splitMode", options: ["ranges", "every", "fixed"], default: "ranges" },
      { type: "text", key: "ranges", default: "1-2", placeholder: "1-3,4,5-8", showIf: { key: "splitMode", equals: "ranges" } },
      { type: "number", key: "chunk", min: 1, default: 2, showIf: { key: "splitMode", equals: "fixed" } },
    ],
  },
  { id: "remove-pages", category: "organize", icon: "FileMinus", color: C.brand, accept: PDF, multiple: false, mode: "client", options: [pagesOpt] },
  { id: "extract-pages", category: "organize", icon: "FileOutput", color: C.brand, accept: PDF, multiple: false, mode: "client", options: [pagesOpt] },
  { id: "organize-pdf", category: "organize", icon: "LayoutGrid", color: C.brand, accept: PDF, multiple: true, mode: "client", editor: "organize" },
  {
    id: "n-up-pdf", category: "organize", icon: "Grid2x2", color: C.brand, accept: PDF, multiple: true, mode: "client",
    options: [{ type: "select", key: "perSheet", options: ["2", "4"], default: "2" }],
  },

  // ---------- Optimize ----------
  {
    id: "compress-pdf", category: "optimize", icon: "Minimize2", color: C.green, accept: PDF, multiple: true, mode: "server", endpoint: "compress-pdf",
    options: [{ type: "select", key: "level", options: ["low", "recommended", "extreme"], default: "recommended" }],
  },
  { id: "grayscale-pdf", category: "optimize", icon: "Contrast", color: C.green, accept: PDF, multiple: true, mode: "server", endpoint: "grayscale-pdf" },
  { id: "flatten-pdf", category: "optimize", icon: "Layers", color: C.green, accept: PDF, multiple: true, mode: "server", endpoint: "flatten-pdf" },
  { id: "repair-pdf", category: "optimize", icon: "Wrench", color: C.green, accept: PDF, multiple: true, mode: "server", endpoint: "repair-pdf" },
  {
    id: "ocr-pdf", category: "optimize", icon: "ScanText", color: C.green, accept: PDF, multiple: true, mode: "server", endpoint: "ocr-pdf",
    options: [{ type: "select", key: "lang", options: ["eng", "fra", "deu", "spa", "ita", "por", "nld", "fra+eng"], default: "fra+eng" }],
  },

  // ---------- Convert to PDF ----------
  {
    id: "jpg-to-pdf", category: "convert-to", icon: "ImagePlus", color: C.orange, accept: IMG, multiple: true, mode: "client",
    options: [
      { type: "select", key: "pageSize", options: ["fit", "a4", "letter"], default: "a4" },
      { type: "select", key: "orientation", options: ["portrait", "landscape"], default: "portrait", showIf: { key: "pageSize", equals: ["a4", "letter"] } },
      { type: "number", key: "margin", min: 0, max: 100, default: 20 },
    ],
  },
  { id: "word-to-pdf", category: "convert-to", icon: "FileText", color: C.blue, accept: ".doc,.docx,.odt,.rtf,.txt", multiple: true, mode: "server", endpoint: "office-to-pdf" },
  { id: "powerpoint-to-pdf", category: "convert-to", icon: "Presentation", color: C.orange, accept: ".ppt,.pptx,.odp", multiple: true, mode: "server", endpoint: "office-to-pdf" },
  { id: "excel-to-pdf", category: "convert-to", icon: "Sheet", color: C.green, accept: ".xls,.xlsx,.ods,.csv", multiple: true, mode: "server", endpoint: "office-to-pdf" },
  {
    id: "html-to-pdf", category: "convert-to", icon: "Globe", color: C.indigo, accept: ".html,.htm", multiple: false, minFiles: 0, mode: "server", endpoint: "html-to-pdf",
    options: [{ type: "text", key: "url", default: "", placeholder: "https://example.com" }],
  },

  // ---------- Convert from PDF ----------
  {
    id: "pdf-to-jpg", category: "convert-from", icon: "Image", color: C.orange, accept: PDF, multiple: true, mode: "client",
    options: [
      { type: "select", key: "format", options: ["jpg", "png"], default: "jpg" },
      { type: "select", key: "dpi", options: ["72", "150", "300"], default: "150" },
    ],
  },
  { id: "pdf-to-word", category: "convert-from", icon: "FileText", color: C.blue, accept: PDF, multiple: true, mode: "server", endpoint: "pdf-to-word" },
  { id: "pdf-to-powerpoint", category: "convert-from", icon: "Presentation", color: C.orange, accept: PDF, multiple: true, mode: "server", endpoint: "pdf-to-powerpoint" },
  { id: "pdf-to-excel", category: "convert-from", icon: "Sheet", color: C.green, accept: PDF, multiple: true, mode: "server", endpoint: "pdf-to-excel" },
  { id: "pdf-to-text", category: "convert-from", icon: "FileType", color: C.gray, accept: PDF, multiple: true, mode: "client" },
  { id: "pdf-to-pdfa", category: "convert-from", icon: "Archive", color: C.gray, accept: PDF, multiple: true, mode: "server", endpoint: "pdf-to-pdfa" },

  // ---------- Edit ----------
  {
    id: "rotate-pdf", category: "edit", icon: "RotateCw", color: C.indigo, accept: PDF, multiple: true, mode: "client",
    options: [
      { type: "select", key: "angle", options: ["90", "180", "270"], default: "90" },
      pagesOpt,
    ],
  },
  {
    id: "page-numbers", category: "edit", icon: "ListOrdered", color: C.indigo, accept: PDF, multiple: true, mode: "client",
    options: [
      { type: "select", key: "position", options: ["bottom-center", "bottom-right", "bottom-left", "top-center", "top-right", "top-left"], default: "bottom-center" },
      { type: "select", key: "numberFormat", options: ["n", "n-of-total", "page-n"], default: "n" },
      { type: "number", key: "startAt", min: 1, default: 1 },
      { type: "number", key: "fontSize", min: 6, max: 48, default: 12 },
    ],
  },
  {
    id: "watermark-pdf", category: "edit", icon: "Stamp", color: C.indigo, accept: PDF, multiple: true, mode: "client",
    options: [
      { type: "text", key: "text", default: "CONFIDENTIAL" },
      { type: "number", key: "fontSize", min: 8, max: 200, default: 60 },
      { type: "color", key: "color", default: "#e03131" },
      { type: "range", key: "opacity", min: 0.05, max: 1, step: 0.05, default: 0.3 },
      { type: "select", key: "layout", options: ["diagonal", "horizontal", "tiled"], default: "diagonal" },
    ],
  },
  { id: "crop-pdf", category: "edit", icon: "Crop", color: C.indigo, accept: PDF, multiple: false, mode: "client", editor: "crop" },
  { id: "edit-pdf", category: "edit", icon: "PencilLine", color: C.pink, accept: PDF, multiple: false, mode: "client", editor: "edit" },
  { id: "sign-pdf", category: "edit", icon: "Signature", color: C.pink, accept: PDF, multiple: false, mode: "client", editor: "sign" },
  { id: "compare-pdf", category: "edit", icon: "GitCompare", color: C.teal, accept: PDF, multiple: true, minFiles: 2, maxFiles: 2, mode: "server", endpoint: "compare-pdf", serverInput: "pair" },

  // ---------- Security ----------
  {
    id: "protect-pdf", category: "security", icon: "Lock", color: C.gray, accept: PDF, multiple: true, mode: "server", endpoint: "protect-pdf",
    options: [{ type: "text", key: "password", default: "", password: true }],
  },
  {
    id: "unlock-pdf", category: "security", icon: "LockOpen", color: C.gray, accept: PDF, multiple: true, mode: "server", endpoint: "unlock-pdf",
    options: [{ type: "text", key: "password", default: "", password: true }],
  },

  {
    id: "redact-pdf", category: "security", icon: "EyeOff", color: C.gray, accept: PDF, multiple: false, mode: "server", endpoint: "redact-pdf", editor: "redact",
    options: [
      { type: "text", key: "terms", default: "", placeholder: "Dupont, 12 rue…" },
      { type: "checkbox", key: "redactEmails", default: false },
      { type: "checkbox", key: "redactPhones", default: false },
      { type: "checkbox", key: "redactIban", default: false },
      { type: "checkbox", key: "redactCards", default: false },
    ],
  },
  {
    id: "edit-metadata", category: "security", icon: "Tags", color: C.gray, accept: PDF, multiple: true, mode: "client",
    options: [
      { type: "checkbox", key: "removeAll", default: false },
      { type: "text", key: "title", default: "", showIf: { key: "removeAll", equals: "false" } },
      { type: "text", key: "author", default: "", showIf: { key: "removeAll", equals: "false" } },
      { type: "text", key: "subject", default: "", showIf: { key: "removeAll", equals: "false" } },
      { type: "text", key: "keywords", default: "", showIf: { key: "removeAll", equals: "false" } },
    ],
  },

  // ---------- Image ----------
  {
    id: "remove-bg", category: "image", icon: "Eraser", color: C.teal, accept: IMG, multiple: true, mode: "client",
    options: [
      { type: "select", key: "background", options: ["transparent", "white", "custom"], default: "transparent" },
      { type: "color", key: "bgColor", default: "#ffffff", showIf: { key: "background", equals: "custom" } },
    ],
  },
  {
    id: "resize-image", category: "image", icon: "Scaling", color: C.teal, accept: IMG, multiple: true, mode: "client",
    options: [
      { type: "select", key: "resizeMode", options: ["percent", "pixels"], default: "percent" },
      { type: "range", key: "percent", min: 5, max: 400, step: 5, default: 50, unit: "%", showIf: { key: "resizeMode", equals: "percent" } },
      { type: "number", key: "width", min: 1, default: 1280, showIf: { key: "resizeMode", equals: "pixels" } },
      { type: "number", key: "height", min: 0, default: 0, showIf: { key: "resizeMode", equals: "pixels" } },
    ],
  },
  {
    id: "blur-image", category: "image", icon: "ScanFace", color: C.teal, accept: IMG, multiple: false, mode: "client", editor: "regions",
    options: [{ type: "select", key: "effect", options: ["pixelate", "blur", "black"], default: "pixelate" }],
  },
  {
    id: "image-to-text", category: "image", icon: "ScanText", color: C.teal, accept: IMG, multiple: true, mode: "server", endpoint: "image-to-text",
    options: [{ type: "select", key: "lang", options: ["eng", "fra", "deu", "spa", "ita", "por", "nld", "fra+eng"], default: "fra+eng" }],
  },
  { id: "crop-image", category: "image", icon: "Crop", color: C.teal, accept: IMG, multiple: false, mode: "client", editor: "crop" },
  {
    id: "compress-image", category: "image", icon: "FileArchive", color: C.teal, accept: IMG, multiple: true, mode: "client",
    options: [
      { type: "range", key: "quality", min: 0.1, max: 1, step: 0.05, default: 0.7 },
      { type: "select", key: "format", options: ["jpg", "webp"], default: "webp" },
    ],
  },
  {
    id: "convert-image", category: "image", icon: "Repeat", color: C.teal, accept: IMG, multiple: true, mode: "client",
    options: [{ type: "select", key: "format", options: ["png", "jpg", "webp"], default: "png" }],
  },
  {
    id: "rotate-image", category: "image", icon: "RotateCcwSquare", color: C.teal, accept: IMG, multiple: true, mode: "client",
    options: [
      { type: "select", key: "angle", options: ["0", "90", "180", "270"], default: "90" },
      { type: "checkbox", key: "flipH", default: false },
      { type: "checkbox", key: "flipV", default: false },
    ],
  },
  {
    id: "upscale-image", category: "image", icon: "ZoomIn", color: C.teal, accept: IMG, multiple: true, mode: "server", endpoint: "upscale-image",
    options: [{ type: "select", key: "scale", options: ["2", "4"], default: "2" }],
  },
  {
    id: "watermark-image", category: "image", icon: "Droplets", color: C.teal, accept: IMG, multiple: true, mode: "client",
    options: [
      { type: "text", key: "text", default: "© My site" },
      { type: "range", key: "sizePct", min: 2, max: 30, step: 1, default: 6, unit: "%" },
      { type: "color", key: "color", default: "#ffffff" },
      { type: "range", key: "opacity", min: 0.05, max: 1, step: 0.05, default: 0.5 },
      { type: "select", key: "position", options: ["bottom-right", "bottom-left", "top-right", "top-left", "center", "tiled"], default: "bottom-right" },
    ],
  },
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<string, Tool>;

/** Option defaults; `localized` (from `t.defaults`, keyed "<tool>.<option>") overrides language-dependent texts. */
export function defaultOptions(tool: Tool, localized: Record<string, string> = {}): Record<string, string | number | boolean> {
  return Object.fromEntries((tool.options ?? []).map((o) => [o.key, localized[`${tool.id}.${o.key}`] ?? o.default]));
}
