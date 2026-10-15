import { degrees, PDFCheckBox, type PDFDict, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField, PDFFont, PDFName, PDFPage, rgb, StandardFonts } from "pdf-lib";
import type { Box, CropRect, EditItem, FormFillData, OrganizeItem, SignPlacement } from "../editorTypes";
import { baseName, hexToRgb01, type Options, type OutputFile, parsePages, parseRangeGroups } from "../files";
import { AppError } from "../errors";
import { readFormFields } from "../formFields";
import { canvasToBlob, openPdf, renderPage } from "../pdfjs";

const PDF_MIME = "application/pdf";

/**
 * pdf-lib cannot decrypt: with ignoreEncryption it "succeeds" but writes unreadable pages,
 * so encrypted inputs are rejected up front (the UI points to the unlock tool).
 */
async function load(file: Blob, options: { updateMetadata?: boolean } = {}): Promise<PDFDocument> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, ...options });
  } catch {
    throw new AppError("invalid_pdf", { name: (file as File).name ?? "" });
  }
  if (doc.isEncrypted) throw new AppError("encrypted", { name: (file as File).name ?? "" });
  return doc;
}

async function save(doc: PDFDocument, name: string): Promise<OutputFile> {
  const bytes = await doc.save();
  return { name, blob: new Blob([bytes as BlobPart], { type: PDF_MIME }) };
}

async function copyPagesTo(src: PDFDocument, indices: number[]): Promise<PDFDocument> {
  const out = await PDFDocument.create();
  for (const p of await out.copyPages(src, indices)) out.addPage(p);
  return out;
}

/** Drop characters the standard (WinAnsi) fonts cannot encode instead of throwing. */
function safeText(font: PDFFont, text: string): string {
  return [...text]
    .filter((ch) => {
      try {
        font.encodeText(ch);
        return true;
      } catch {
        return false;
      }
    })
    .join("");
}

/**
 * Convert a box expressed in display fractions (what the user saw, rotation applied, top-left origin)
 * into pdf-lib drawing params in unrotated user space.
 */
function placeBox(page: PDFPage, box: Omit<Box, "page">) {
  const crop = page.getCropBox();
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  const W = crop.width;
  const H = crop.height;
  const dispW = r % 180 === 0 ? W : H;
  const dispH = r % 180 === 0 ? H : W;
  // anchor = bottom-left corner of the box as displayed
  const u = box.x;
  const v = box.y + box.h;
  let x: number, y: number;
  switch (r) {
    case 90: x = v * W; y = u * H; break;
    case 180: x = W * (1 - u); y = v * H; break;
    case 270: x = W * (1 - v); y = H * (1 - u); break;
    default: x = u * W; y = (1 - v) * H;
  }
  return { x: crop.x + x, y: crop.y + y, width: box.w * dispW, height: box.h * dispH, rotate: degrees(r), dispW, dispH };
}

/** Map a point given in display fractions (rotation applied, top-left origin) to unrotated user space. */
function mapPoint(page: PDFPage, u: number, v: number): [number, number] {
  const crop = page.getCropBox();
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  const { width: W, height: H } = crop;
  const [x, y] =
    r === 90 ? [v * W, u * H] : r === 180 ? [W * (1 - u), v * H] : r === 270 ? [W * (1 - v), H * (1 - u)] : [u * W, (1 - v) * H];
  return [crop.x + x, crop.y + y];
}

// ---------------------------------------------------------------------------

export async function mergePdf(files: File[]): Promise<OutputFile[]> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await load(f);
    for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
  }
  return [await save(out, "merged.pdf")];
}

export async function alternatePdf(files: File[], o: Options): Promise<OutputFile[]> {
  const [a, b] = await Promise.all(files.slice(0, 2).map((f) => load(f)));
  const ia = a.getPageIndices();
  const ib = b.getPageIndices();
  if (o.reverseSecond) ib.reverse();
  const out = await PDFDocument.create();
  const pa = await out.copyPages(a, ia);
  const pb = await out.copyPages(b, ib);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (i < pa.length) out.addPage(pa[i]);
    if (i < pb.length) out.addPage(pb[i]);
  }
  return [await save(out, `${baseName(files[0].name)}_alternated.pdf`)];
}

export async function splitInHalf(files: File[], o: Options): Promise<OutputFile[]> {
  const lr = o.halfMode !== "top-bottom";
  const outs: OutputFile[] = [];
  for (const f of files) {
    const src = await load(f);
    const out = await PDFDocument.create();
    for (const p of await out.copyPages(src, src.getPageIndices())) {
      // the second half is a shallow clone of the page dict: content and resources stay shared
      const clone = p.node.clone();
      const second = PDFPage.of(clone, out.context.register(clone), out);
      // display-space rectangles of the two halves, in reading order (or reversed for right-to-left)
      const halves = lr ? [[0, 0, 0.5, 1], [0.5, 0, 1, 1]] : [[0, 0, 1, 0.5], [0, 0.5, 1, 1]];
      if (o.rtl && lr) halves.reverse();
      [p, second].forEach((page, k) => {
        const [u0, v0, u1, v1] = halves[k];
        const [x0, y0] = mapPoint(page, u0, v0);
        const [x1, y1] = mapPoint(page, u1, v1);
        page.setCropBox(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      });
      out.addPage(p);
      out.addPage(second);
    }
    outs.push(await save(out, `${baseName(f.name)}_halved.pdf`));
  }
  return outs;
}

export async function splitPdf(files: File[], o: Options): Promise<OutputFile[]> {
  const file = files[0];
  const src = await load(file);
  const total = src.getPageCount();
  let groups: number[][];
  if (o.splitMode === "every") groups = src.getPageIndices().map((i) => [i]);
  else if (o.splitMode === "fixed") {
    const n = Math.max(1, Number(o.chunk) || 1);
    groups = [];
    for (let i = 0; i < total; i += n) groups.push(src.getPageIndices().slice(i, i + n));
  } else groups = parseRangeGroups(String(o.ranges), total);
  if (!groups.length) throw new AppError("no_pages_selected");

  const base = baseName(file.name);
  const outs: OutputFile[] = [];
  for (const g of groups) {
    const label = g.length === 1 ? `${g[0] + 1}` : `${g[0] + 1}-${g[g.length - 1] + 1}`;
    outs.push(await save(await copyPagesTo(src, g), `${base}_${label}.pdf`));
  }
  return outs;
}

export async function removePages(files: File[], o: Options): Promise<OutputFile[]> {
  const src = await load(files[0]);
  const toRemove = new Set(parsePages(String(o.pages), src.getPageCount()));
  const keep = src.getPageIndices().filter((i) => !toRemove.has(i));
  if (!keep.length) throw new AppError("cannot_remove_all");
  return [await save(await copyPagesTo(src, keep), `${baseName(files[0].name)}_edited.pdf`)];
}

export async function extractPages(files: File[], o: Options): Promise<OutputFile[]> {
  const src = await load(files[0]);
  const pages = parsePages(String(o.pages), src.getPageCount());
  return [await save(await copyPagesTo(src, pages), `${baseName(files[0].name)}_extract.pdf`)];
}

export async function organizePdf(files: File[], _o: Options, items: OrganizeItem[]): Promise<OutputFile[]> {
  if (!items?.length) throw new AppError("no_pages_selected");
  const srcs = await Promise.all(files.map((f) => load(f)));
  const out = await PDFDocument.create();
  for (const it of items) {
    const [p] = await out.copyPages(srcs[it.file], [it.page]);
    p.setRotation(degrees((p.getRotation().angle + it.rotation) % 360));
    out.addPage(p);
  }
  return [await save(out, `${baseName(files[0].name)}_organized.pdf`)];
}

export async function rotatePdf(files: File[], o: Options): Promise<OutputFile[]> {
  const angle = Number(o.angle);
  const outs: OutputFile[] = [];
  for (const f of files) {
    const doc = await load(f);
    for (const i of parsePages(String(o.pages ?? ""), doc.getPageCount())) {
      const p = doc.getPage(i);
      p.setRotation(degrees((p.getRotation().angle + angle) % 360));
    }
    outs.push(await save(doc, `${baseName(f.name)}_rotated.pdf`));
  }
  return outs;
}

/** Draw a one-line label inside the page margin (display space, so it works on rotated pages). */
function drawLabel(page: PDFPage, font: PDFFont, text: string, size: number, vert: string, horiz: string) {
  const margin = 24;
  const { dispW, dispH } = placeBox(page, { x: 0, y: 0, w: 1, h: 1 });
  const tw = font.widthOfTextAtSize(text, size);
  const bx = horiz === "left" ? margin : horiz === "right" ? dispW - margin - tw : (dispW - tw) / 2;
  const by = vert === "top" ? margin : dispH - margin - size;
  const pl = placeBox(page, { x: bx / dispW, y: by / dispH, w: tw / dispW, h: size / dispH });
  page.drawText(text, { x: pl.x, y: pl.y, size, font, color: rgb(0.2, 0.2, 0.2), rotate: pl.rotate });
}

export async function pageNumbers(files: File[], o: Options): Promise<OutputFile[]> {
  const size = Number(o.fontSize) || 12;
  const start = Number(o.startAt) || 1;
  const [vert, horiz] = String(o.position).split("-");
  const outs: OutputFile[] = [];
  for (const f of files) {
    const doc = await load(f);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const total = doc.getPageCount();
    doc.getPages().forEach((page, i) => {
      const n = i + start;
      const label =
        o.numberFormat === "n-of-total" ? `${n} / ${total + start - 1}` : o.numberFormat === "page-n" ? `Page ${n}` : `${n}`;
      drawLabel(page, font, label, size, vert, horiz);
    });
    outs.push(await save(doc, `${baseName(f.name)}_numbered.pdf`));
  }
  return outs;
}

export async function headerFooter(files: File[], o: Options): Promise<OutputFile[]> {
  const header = String(o.headerText ?? "").trim();
  const footer = String(o.footerText ?? "").trim();
  if (!header && !footer) throw new AppError("nothing_to_add");
  const size = Math.min(36, Math.max(6, Number(o.fontSize) || 10));
  const start = Number(o.startAt) || 1;
  const horiz = String(o.align || "center");
  const now = new Date();
  const date = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  const outs: OutputFile[] = [];
  for (const f of files) {
    const doc = await load(f);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const total = doc.getPageCount() + start - 1;
    const name = baseName(f.name);
    doc.getPages().forEach((page, i) => {
      const fill = (tpl: string) =>
        safeText(font, tpl.replace(/\{n\}/g, String(i + start)).replace(/\{total\}/g, String(total)).replace(/\{date\}/g, date).replace(/\{file\}/g, name));
      if (header) drawLabel(page, font, fill(header), size, "top", horiz);
      if (footer) drawLabel(page, font, fill(footer), size, "bottom", horiz);
    });
    outs.push(await save(doc, `${name}_headerfooter.pdf`));
  }
  return outs;
}

export async function batesNumbering(files: File[], o: Options): Promise<OutputFile[]> {
  const size = Number(o.fontSize) || 10;
  const digits = Math.min(10, Math.max(1, Math.round(Number(o.digits) || 6)));
  let n = Math.max(0, Math.round(Number(o.startAt) || 1));
  const [vert, horiz] = String(o.position).split("-");
  const outs: OutputFile[] = [];
  for (const f of files) {
    const doc = await load(f);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const page of doc.getPages()) {
      const label = safeText(font, `${o.prefix ?? ""}${String(n++).padStart(digits, "0")}${o.suffix ?? ""}`);
      drawLabel(page, font, label, size, vert, horiz);
    }
    outs.push(await save(doc, `${baseName(f.name)}_bates.pdf`));
  }
  return outs;
}

export async function watermarkPdf(files: File[], o: Options): Promise<OutputFile[]> {
  const size = Number(o.fontSize) || 60;
  const opacity = Number(o.opacity) || 0.3;
  const [r, g, b] = hexToRgb01(String(o.color));
  const outs: OutputFile[] = [];
  for (const f of files) {
    const doc = await load(f);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const text = safeText(font, String(o.text || "")) || "WATERMARK";
    const tw = font.widthOfTextAtSize(text, size);
    for (const page of doc.getPages()) {
      const { width: W, height: H, x: x0, y: y0 } = page.getCropBox();
      const pageRot = page.getRotation().angle;
      const angle = (o.layout === "horizontal" ? 0 : 45) + pageRot;
      const rad = (angle * Math.PI) / 180;
      const draw = (cx: number, cy: number) =>
        page.drawText(text, {
          // shift origin so the text's visual center lands on (cx, cy)
          x: cx - (tw / 2) * Math.cos(rad) + (size / 3) * Math.sin(rad),
          y: cy - (tw / 2) * Math.sin(rad) - (size / 3) * Math.cos(rad),
          size, font, color: rgb(r, g, b), opacity, rotate: degrees(angle),
        });
      if (o.layout === "tiled") {
        const stepX = tw * 0.9 + size * 2;
        const stepY = size * 4;
        for (let y = y0 - H; y < y0 + 2 * H; y += stepY)
          for (let x = x0 - W; x < x0 + 2 * W; x += stepX) draw(x, y);
      } else draw(x0 + W / 2, y0 + H / 2);
    }
    outs.push(await save(doc, `${baseName(f.name)}_watermark.pdf`));
  }
  return outs;
}

export async function signPdf(files: File[], _o: Options, placements: SignPlacement[]): Promise<OutputFile[]> {
  if (!placements?.length) throw new AppError("place_signature");
  const doc = await load(files[0]);
  const cache = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
  for (const s of placements) {
    let img = cache.get(s.image);
    if (!img) {
      img = await doc.embedPng(s.image);
      cache.set(s.image, img);
    }
    const page = doc.getPage(s.page);
    const pl = placeBox(page, s);
    page.drawImage(img, { x: pl.x, y: pl.y, width: pl.width, height: pl.height, rotate: pl.rotate });
  }
  return [await save(doc, `${baseName(files[0].name)}_signed.pdf`)];
}

export async function fillPdfForm(files: File[], o: Options, data: FormFillData | null): Promise<OutputFile[]> {
  const doc = await load(files[0]);
  readFormFields(doc, files[0].name); // throws no_form_fields / xfa_form
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [name, value] of Object.entries(data?.values ?? {})) {
    try {
      const field = form.getField(name);
      const text = (v: string) => safeText(font, v);
      if (field instanceof PDFTextField) field.setText(text(String(value)));
      else if (field instanceof PDFCheckBox) { if (value) field.check(); else field.uncheck(); }
      else if (field instanceof PDFRadioGroup) field.select(String(value));
      else if (field instanceof PDFDropdown) field.select(text(String(value)));
      else if (field instanceof PDFOptionList) field.select(([] as string[]).concat(value as string[]).map(text));
      else continue;
      field.defaultUpdateAppearances(font);
    } catch {
      // skip a field we cannot set (unknown name, value outside its options, odd structure)
    }
  }
  try {
    if (o.flatten) {
      // fields with no appearance stream yet would vanish when flattened
      try { form.updateFieldAppearances(font); } catch { /* keep existing appearances */ }
      form.flatten({ updateFieldAppearances: false });
    }
    return [await save(doc, `${baseName(files[0].name)}_filled.pdf`)];
  } catch {
    throw new AppError("processing_failed");
  }
}

export async function editPdf(files: File[], _o: Options, items: EditItem[]): Promise<OutputFile[]> {
  if (!items?.length) throw new AppError("nothing_to_apply");
  const doc = await load(files[0]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const it of items) {
    const page = doc.getPage(it.page);
    const pl = placeBox(page, it);
    const common = { x: pl.x, y: pl.y, width: pl.width, height: pl.height, rotate: pl.rotate };
    if (it.kind === "text") {
      const [r, g, b] = hexToRgb01(it.color);
      const lines = it.text.split("\n").map((l) => safeText(font, l));
      // Matches the editor's CSS (line-height 1.2): baseline sits ~0.95em below each line's top.
      lines.forEach((line, i) => {
        const top = it.y + (i * it.size * 1.2) / pl.dispH;
        const lb = placeBox(page, { x: it.x, y: top, w: it.w, h: (it.size * 0.95) / pl.dispH });
        page.drawText(line, { x: lb.x, y: lb.y, size: it.size, font, color: rgb(r, g, b), rotate: lb.rotate });
      });
    } else if (it.kind === "whiteout") {
      page.drawRectangle({ ...common, color: rgb(1, 1, 1) });
    } else if (it.kind === "highlight") {
      const [r, g, b] = hexToRgb01(it.color);
      page.drawRectangle({ ...common, color: rgb(r, g, b), opacity: 0.35 });
    } else {
      const [r, g, b] = hexToRgb01(it.color);
      page.drawRectangle({ ...common, borderColor: rgb(r, g, b), borderWidth: 2 });
    }
  }
  return [await save(doc, `${baseName(files[0].name)}_edited.pdf`)];
}

export async function pdfToImages(files: File[], o: Options): Promise<OutputFile[]> {
  const fmt = o.format === "png" ? "png" : "jpg";
  const mime = fmt === "png" ? "image/png" : "image/jpeg";
  const scale = (Number(o.dpi) || 150) / 72;
  const outs: OutputFile[] = [];
  for (const f of files) {
    const doc = await openPdf(f);
    try {
      for (let i = 1; i <= doc.numPages; i++) {
        const canvas = await renderPage(doc, i, scale);
        outs.push({ name: `${baseName(f.name)}_page${i}.${fmt}`, blob: await canvasToBlob(canvas, mime, 0.92) });
        canvas.width = canvas.height = 0; // free memory early
      }
    } finally {
      await doc.destroy();
    }
  }
  return outs;
}

const PAGE_SIZES: Record<string, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };

export async function imagesToPdf(files: File[], o: Options): Promise<OutputFile[]> {
  const doc = await PDFDocument.create();
  const margin = Number(o.margin) || 0;
  for (const f of files) {
    const type = f.type || "";
    let img;
    if (type === "image/jpeg" || /\.jpe?g$/i.test(f.name)) img = await doc.embedJpg(await f.arrayBuffer());
    else if (type === "image/png" || /\.png$/i.test(f.name)) img = await doc.embedPng(await f.arrayBuffer());
    else {
      // webp/bmp: re-encode through a canvas
      const bmp = await createImageBitmap(f);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext("2d")!.drawImage(bmp, 0, 0);
      img = await doc.embedPng(await (await canvasToBlob(c)).arrayBuffer());
    }
    let pw: number, ph: number;
    if (o.pageSize === "fit") {
      pw = img.width + 2 * margin;
      ph = img.height + 2 * margin;
    } else {
      [pw, ph] = PAGE_SIZES[String(o.pageSize)] ?? PAGE_SIZES.a4;
      if (o.orientation === "landscape") [pw, ph] = [ph, pw];
    }
    const s = Math.min((pw - 2 * margin) / img.width, (ph - 2 * margin) / img.height, o.pageSize === "fit" ? 1 : Infinity);
    const w = img.width * s;
    const h = img.height * s;
    doc.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  return [await save(doc, files.length === 1 ? `${baseName(files[0].name)}.pdf` : "images.pdf")];
}

export async function cropPdf(files: File[], _o: Options, rect: CropRect): Promise<OutputFile[]> {
  const r = rect ?? { x: 0, y: 0, w: 1, h: 1 };
  const doc = await load(files[0]);
  for (const page of doc.getPages()) {
    const [x1, y1] = mapPoint(page, r.x, r.y);
    const [x2, y2] = mapPoint(page, r.x + r.w, r.y + r.h);
    page.setCropBox(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  }
  return [await save(doc, `${baseName(files[0].name)}_cropped.pdf`)];
}

export async function pdfToText(files: File[]): Promise<OutputFile[]> {
  const outs: OutputFile[] = [];
  for (const f of files) {
    const doc = await openPdf(f);
    try {
      const pages: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        let text = "";
        for (const item of content.items) {
          if (!("str" in item)) continue;
          text += item.str + (item.hasEOL ? "\n" : "");
        }
        pages.push(text.trim());
      }
      // scanned PDF: an empty .txt would look like a bug, point to OCR instead
      if (!pages.some(Boolean)) throw new AppError("no_text", { name: f.name });
      const body = pages.map((t, i) => (doc.numPages > 1 ? `--- Page ${i + 1} ---\n${t}` : t)).join("\n\n");
      outs.push({ name: `${baseName(f.name)}.txt`, blob: new Blob([body + "\n"], { type: "text/plain;charset=utf-8" }) });
    } finally {
      await doc.destroy();
    }
  }
  return outs;
}

export async function nUpPdf(files: File[], o: Options): Promise<OutputFile[]> {
  const per = Number(o.perSheet) === 4 ? 4 : 2;
  // 2-up: A4 landscape, side by side; 4-up: A4 portrait, 2x2
  const [SW, SH] = per === 2 ? [841.89, 595.28] : [595.28, 841.89];
  const [cols, rows] = per === 2 ? [2, 1] : [2, 2];
  const margin = 18;
  const cellW = (SW - margin * (cols + 1)) / cols;
  const cellH = (SH - margin * (rows + 1)) / rows;
  const outs: OutputFile[] = [];
  for (const f of files) {
    const src = await load(f);
    const out = await PDFDocument.create();
    const embedded = await out.embedPages(src.getPages());
    for (let i = 0; i < embedded.length; i += per) {
      const sheet = out.addPage([SW, SH]);
      embedded.slice(i, i + per).forEach((ep, k) => {
        const rot = ((src.getPage(i + k).getRotation().angle % 360) + 360) % 360;
        const [dw, dh] = rot % 180 ? [ep.height, ep.width] : [ep.width, ep.height];
        const s = Math.min(cellW / dw, cellH / dh);
        const col = k % cols;
        const row = Math.floor(k / cols);
        // centre the (displayed) page in its cell
        const cx = margin + col * (cellW + margin) + (cellW - dw * s) / 2;
        const cy = SH - margin - (row + 1) * cellH - row * margin + (cellH - dh * s) / 2;
        // embedded pages ignore /Rotate: rotate around the anchor so the page shows as it does in a viewer
        const [ax, ay] =
          rot === 90 ? [cx, cy + dh * s] : rot === 180 ? [cx + dw * s, cy + dh * s] : rot === 270 ? [cx + dw * s, cy] : [cx, cy];
        sheet.drawPage(ep, { x: ax, y: ay, xScale: s, yScale: s, rotate: degrees(-rot) });
      });
    }
    outs.push(await save(out, `${baseName(f.name)}_${per}up.pdf`));
  }
  return outs;
}

export async function editMetadata(files: File[], o: Options): Promise<OutputFile[]> {
  const outs: OutputFile[] = [];
  for (const f of files) {
    // updateMetadata:false stops pdf-lib from stamping its own Producer/ModDate
    const doc = await load(f, { updateMetadata: false });
    if (o.removeAll) {
      const info = (doc as unknown as { getInfoDict(): PDFDict }).getInfoDict();
      for (const key of info.keys()) info.delete(key);
      doc.catalog.delete(PDFName.of("Metadata")); // XMP stream
    } else {
      if (o.title) doc.setTitle(String(o.title));
      if (o.author) doc.setAuthor(String(o.author));
      if (o.subject) doc.setSubject(String(o.subject));
      if (o.keywords) doc.setKeywords(String(o.keywords).split(",").map((k) => k.trim()).filter(Boolean));
    }
    outs.push(await save(doc, f.name));
  }
  return outs;
}
