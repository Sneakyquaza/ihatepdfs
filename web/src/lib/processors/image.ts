import type { CropRect } from "../editorTypes";
import { baseName, type Options, type OutputFile } from "../files";
import { AppError } from "../errors";
import type { Progress } from "./index";
import { canvasToBlob } from "../pdfjs";

type Fmt = "png" | "jpg" | "webp";
const MIME: Record<Fmt, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

function inputFormat(file: File): Fmt {
  if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) return "jpg";
  if (file.type === "image/webp" || /\.webp$/i.test(file.name)) return "webp";
  return "png";
}

async function bitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { c, ctx };
}

async function exportCanvas(c: HTMLCanvasElement, fmt: Fmt, name: string, quality = 0.92): Promise<OutputFile> {
  let src = c;
  if (fmt === "jpg") {
    // JPEG has no alpha: flatten on white
    const flat = canvas(c.width, c.height);
    flat.ctx.fillStyle = "#fff";
    flat.ctx.fillRect(0, 0, c.width, c.height);
    flat.ctx.drawImage(c, 0, 0);
    src = flat.c;
  }
  return { name: `${name}.${fmt}`, blob: await canvasToBlob(src, MIME[fmt], quality) };
}

/** Downscale in halving steps for better quality than a single big drawImage. */
function drawScaled(img: CanvasImageSource & { width: number; height: number }, w: number, h: number): HTMLCanvasElement {
  let cur: CanvasImageSource & { width: number; height: number } = img;
  let cw = img.width;
  let ch = img.height;
  while (cw / 2 > w && ch / 2 > h) {
    cw = Math.round(cw / 2);
    ch = Math.round(ch / 2);
    const step = canvas(cw, ch);
    step.ctx.drawImage(cur, 0, 0, cw, ch);
    cur = step.c;
  }
  const out = canvas(w, h);
  out.ctx.drawImage(cur, 0, 0, out.c.width, out.c.height);
  return out.c;
}

// ---------------------------------------------------------------------------

type Rgb = [number, number, number];
const KEY_TOLERANCE = 40; // RGB distance still counted as "background color" (JPEG noise, anti-aliasing)

/**
 * Dominant color of the image border, the share of border pixels close to it and how much those
 * vary (max per-channel std). `null` color = the border is (mostly) already transparent.
 */
function borderColor(d: Uint8ClampedArray, w: number, h: number): { color: Rgb | null; share: number; spread: number } {
  const idx: number[] = [];
  for (let x = 0; x < w; x++) idx.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) idx.push(y * w, y * w + w - 1);
  const clear = idx.filter((i) => d[i * 4 + 3] < 16).length;
  if (clear / idx.length >= 0.5) return { color: null, share: clear / idx.length, spread: 0 };
  // most frequent 4-bit-per-channel bucket, then the mean of its pixels
  const count = new Uint32Array(4096);
  const bucket = (i: number) => ((d[i * 4] >> 4) << 8) | ((d[i * 4 + 1] >> 4) << 4) | (d[i * 4 + 2] >> 4);
  for (const i of idx) count[bucket(i)]++;
  const best = count.indexOf(Math.max(...count));
  const mean = (px: number[]) => [0, 1, 2].map((c) => px.reduce((t, i) => t + d[i * 4 + c], 0) / px.length) as Rgb;
  const color = mean(idx.filter((i) => bucket(i) === best));
  const near = idx.filter((i) => d[i * 4 + 3] >= 16 && colorDist(d, i, color) <= KEY_TOLERANCE);
  const m = mean(near);
  const spread = Math.max(...[0, 1, 2].map((c) => Math.sqrt(near.reduce((t, i) => t + (d[i * 4 + c] - m[c]) ** 2, 0) / near.length)));
  return { color, share: (near.length + clear) / idx.length, spread };
}

function colorDist(d: Uint8ClampedArray, i: number, c: Rgb) {
  return Math.hypot(d[i * 4] - c[0], d[i * 4 + 1] - c[1], d[i * 4 + 2] - c[2]);
}

/** 4-connected flood fill over `ok` pixels from `seeds`; marks `mark` in `out` and returns the pixels reached. */
function flood(w: number, h: number, seeds: number[], ok: (i: number) => boolean, out: Uint8Array, mark: number): number[] {
  const reached: number[] = [];
  const visit = (i: number) => { if (!out[i] && ok(i)) { out[i] = mark; reached.push(i); } };
  seeds.forEach(visit);
  for (let k = 0; k < reached.length; k++) {
    const i = reached[k];
    const x = i % w;
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (i >= w) visit(i - w);
    if (i < w * (h - 1)) visit(i + w);
  }
  return reached;
}

/**
 * Removes a plain background by flood-filling it from the image border, so areas of the same
 * color enclosed by the subject survive. Whether such an enclosed area is a hole (the inside of
 * an "o") or part of the subject (the white "Tube" of the old YouTube logo) is not a color
 * question: the AI mask decides, each area going with its mean alpha. The 1px rim of the subject
 * is un-blended from the background color for anti-aliased edges without halo or dark fringe.
 */
async function keyOutBackground(img: ImageData, bg: Rgb | null, aiAlpha: () => Promise<Uint8ClampedArray>) {
  const { data: d, width: w, height: h } = img;
  const isBg = (i: number) => d[i * 4 + 3] < 16 || (bg !== null && colorDist(d, i, bg) <= KEY_TOLERANCE);
  const gone = new Uint8Array(w * h); // 1 = background, 2 = enclosed area kept as subject
  const edge: number[] = [];
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) edge.push(y * w, y * w + w - 1);
  flood(w, h, edge, isBg, gone, 1);

  const enclosed: number[][] = [];
  for (let i = 0; i < w * h; i++) {
    if (gone[i] || !isBg(i)) continue;
    const area = flood(w, h, [i], isBg, gone, 2);
    if (area.length >= 12) enclosed.push(area); // smaller specks are highlights or noise
  }
  if (enclosed.length) {
    const ai = await aiAlpha();
    for (const area of enclosed) {
      if (area.reduce((t, i) => t + ai[i], 0) / area.length < 128) for (const i of area) gone[i] = 1;
    }
  }

  if (!bg) {
    for (let i = 0; i < w * h; i++) if (gone[i] === 1) d[i * 4 + 3] = 0;
    return;
  }
  const near = (i: number, r: number, test: (j: number) => boolean) => {
    const x = i % w, y = (i - x) / w;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && test(ny * w + nx)) return true;
    }
    return false;
  };
  const rim = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (gone[i] !== 1 && near(i, 1, (j) => gone[j] === 1)) rim[i] = 1;
  const src = d.slice();
  for (let i = 0; i < w * h; i++) {
    if (gone[i] === 1) { d[i * 4 + 3] = 0; continue; }
    if (!rim[i]) continue;
    // Un-blend the edge pixel p = a * fg + (1 - a) * bg. fg = the most contrasted solid subject
    // pixel nearby, a = projection of p on bg->fg; without one (1-2px strokes), the smallest a
    // that keeps fg in range ("color to alpha").
    let fg = -1, best = 30;
    near(i, 2, (j) => {
      if (gone[j] !== 1 && !rim[j] && colorDist(src, j, bg) > best) { best = colorDist(src, j, bg); fg = j; }
      return false;
    });
    let a = 0;
    if (fg >= 0) {
      let dot = 0;
      for (let c = 0; c < 3; c++) dot += (src[i * 4 + c] - bg[c]) * (src[fg * 4 + c] - bg[c]);
      a = Math.min(1, Math.max(0, dot / best ** 2));
      for (let c = 0; c < 3; c++) d[i * 4 + c] = src[fg * 4 + c];
    } else {
      for (let c = 0; c < 3; c++) {
        const p = src[i * 4 + c], b = bg[c];
        if (p > b) a = Math.max(a, (p - b) / (255 - b));
        else if (p < b) a = Math.max(a, (b - p) / b);
      }
      a = Math.min(1, a);
      if (a > 0) for (let c = 0; c < 3; c++) d[i * 4 + c] = bg[c] + (src[i * 4 + c] - bg[c]) / a;
    }
    d[i * 4 + 3] = Math.round(src[i * 4 + 3] * a);
  }
}

async function aiCutout(f: File, onProgress?: (p: Progress) => void): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  return removeBackground(f, {
    // model + runtime are self-hosted (scripts/fetch-bg-model.mjs): no third-party request
    publicPath: `${window.location.origin}/bg-model/`,
    output: { format: "image/png" },
    progress: (key: string, current: number, total: number) => {
      if (key.startsWith("fetch") && total) onProgress?.({ phase: "model", fraction: current / total });
      else if (key.startsWith("compute")) onProgress?.({ phase: "work" });
    },
  });
}

/**
 * Plain-background cut-out, or null when `auto` finds the background too busy for it. Tightly
 * cropped logos have the subject touching the border, hence the lenient share; photos fail on
 * the spread (gradients, texture) rather than on the share.
 */
async function removeFlatBg(f: File, force: boolean, onProgress?: (p: Progress) => void): Promise<Blob | null> {
  const bmp = await bitmap(f);
  const { c, ctx } = canvas(bmp.width, bmp.height);
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const { color, share, spread } = borderColor(img.data, c.width, c.height);
  if (!force && (share < 0.6 || spread > 10)) return null;
  await keyOutBackground(img, color, async () => {
    const mask = canvas(c.width, c.height);
    mask.ctx.drawImage(await bitmap(await aiCutout(f, onProgress)), 0, 0, c.width, c.height);
    const rgba = mask.ctx.getImageData(0, 0, c.width, c.height).data;
    return rgba.filter((_, k) => k % 4 === 3);
  });
  ctx.putImageData(img, 0, 0);
  return canvasToBlob(c, "image/png");
}

export async function removeBg(files: File[], o: Options, onProgress?: (p: Progress) => void): Promise<OutputFile[]> {
  const outs: OutputFile[] = [];
  for (const f of files) {
    // ISNet is trained on photos: on logos and graphics it eats into areas of the background color
    // and leaves a halo, so plain backgrounds are keyed out instead (AI only arbitrates holes).
    const flat = o.method === "ai" ? null : await removeFlatBg(f, o.method === "flat", onProgress);
    const cut = flat ?? await aiCutout(f, onProgress);
    if (o.background === "transparent") {
      outs.push({ name: `${baseName(f.name)}_nobg.png`, blob: cut });
      continue;
    }
    const bmp = await bitmap(cut);
    const { c, ctx } = canvas(bmp.width, bmp.height);
    ctx.fillStyle = o.background === "white" ? "#ffffff" : String(o.bgColor);
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0);
    outs.push(await exportCanvas(c, "png", `${baseName(f.name)}_nobg`));
  }
  return outs;
}

export async function resizeImage(files: File[], o: Options): Promise<OutputFile[]> {
  const outs: OutputFile[] = [];
  for (const f of files) {
    const img = await bitmap(f);
    let w: number, h: number;
    if (o.resizeMode === "pixels") {
      const tw = Number(o.width) || 0;
      const th = Number(o.height) || 0;
      if (tw && th) [w, h] = [tw, th];
      else if (tw) [w, h] = [tw, (img.height * tw) / img.width];
      else if (th) [w, h] = [(img.width * th) / img.height, th];
      else [w, h] = [img.width, img.height];
    } else {
      const p = (Number(o.percent) || 100) / 100;
      [w, h] = [img.width * p, img.height * p];
    }
    const c = drawScaled(img, Math.round(w), Math.round(h));
    outs.push(await exportCanvas(c, inputFormat(f), `${baseName(f.name)}_${c.width}x${c.height}`));
  }
  return outs;
}

export async function cropImage(files: File[], _o: Options, rect: CropRect): Promise<OutputFile[]> {
  const f = files[0];
  const img = await bitmap(f);
  const r = rect ?? { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(r.x * img.width);
  const sy = Math.round(r.y * img.height);
  const sw = Math.max(1, Math.round(r.w * img.width));
  const sh = Math.max(1, Math.round(r.h * img.height));
  const { c, ctx } = canvas(sw, sh);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return [await exportCanvas(c, inputFormat(f), `${baseName(f.name)}_cropped`)];
}

export async function compressImage(files: File[], o: Options): Promise<OutputFile[]> {
  const fmt: Fmt = o.format === "jpg" ? "jpg" : "webp";
  const q = Number(o.quality) || 0.7;
  const outs: OutputFile[] = [];
  for (const f of files) {
    const img = await bitmap(f);
    const { c, ctx } = canvas(img.width, img.height);
    ctx.drawImage(img, 0, 0);
    const out = await exportCanvas(c, fmt, `${baseName(f.name)}_compressed`, q);
    // never hand back something bigger than the original in the same format
    outs.push(out.blob.size >= f.size && inputFormat(f) === fmt ? { name: f.name, blob: f } : out);
  }
  return outs;
}

export async function convertImage(files: File[], o: Options): Promise<OutputFile[]> {
  const fmt = (["png", "jpg", "webp"].includes(String(o.format)) ? o.format : "png") as Fmt;
  const outs: OutputFile[] = [];
  for (const f of files) {
    const img = await bitmap(f);
    const { c, ctx } = canvas(img.width, img.height);
    ctx.drawImage(img, 0, 0);
    outs.push(await exportCanvas(c, fmt, baseName(f.name)));
  }
  return outs;
}

export async function rotateImage(files: File[], o: Options): Promise<OutputFile[]> {
  const angle = Number(o.angle) || 0;
  const outs: OutputFile[] = [];
  for (const f of files) {
    const img = await bitmap(f);
    const swap = angle % 180 !== 0;
    const { c, ctx } = canvas(swap ? img.height : img.width, swap ? img.width : img.height);
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    outs.push(await exportCanvas(c, inputFormat(f), `${baseName(f.name)}_rotated`));
  }
  return outs;
}

export async function watermarkImage(files: File[], o: Options): Promise<OutputFile[]> {
  const text = String(o.text || "");
  const outs: OutputFile[] = [];
  for (const f of files) {
    const img = await bitmap(f);
    const { c, ctx } = canvas(img.width, img.height);
    ctx.drawImage(img, 0, 0);
    const size = Math.max(8, (Math.min(c.width, c.height) * (Number(o.sizePct) || 6)) / 100);
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    ctx.fillStyle = String(o.color);
    ctx.globalAlpha = Number(o.opacity) || 0.5;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = size / 8;
    const tw = ctx.measureText(text).width;
    const pad = size * 0.8;
    const pos = String(o.position);
    if (pos === "tiled") {
      ctx.save();
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate(-Math.PI / 6);
      const diag = Math.hypot(c.width, c.height);
      for (let y = -diag / 2; y < diag / 2; y += size * 3)
        for (let x = -diag / 2; x < diag / 2; x += tw + size * 2) ctx.fillText(text, x, y);
      ctx.restore();
    } else {
      ctx.textBaseline = "middle";
      const x = pos.endsWith("left") ? pad : pos.endsWith("right") ? c.width - pad - tw : (c.width - tw) / 2;
      const y = pos.startsWith("top") ? pad + size / 2 : pos.startsWith("bottom") ? c.height - pad - size / 2 : c.height / 2;
      ctx.fillText(text, x, y);
    }
    outs.push(await exportCanvas(c, inputFormat(f), `${baseName(f.name)}_watermark`));
  }
  return outs;
}

export async function blurImage(files: File[], o: Options, regions: CropRect[]): Promise<OutputFile[]> {
  if (!regions?.length) throw new AppError("draw_area");
  const f = files[0];
  const img = await bitmap(f);
  const { c, ctx } = canvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const supportsFilter = typeof ctx.filter === "string";
  for (const r of regions) {
    const x = Math.round(r.x * c.width), y = Math.round(r.y * c.height);
    const w = Math.max(1, Math.round(r.w * c.width)), h = Math.max(1, Math.round(r.h * c.height));
    if (o.effect === "black") {
      ctx.fillStyle = "#000";
      ctx.fillRect(x, y, w, h);
    } else if (o.effect === "blur" && supportsFilter) {
      // blur a padded copy so edges don't pull in transparent pixels
      const pad = Math.ceil(Math.max(w, h) / 6);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.filter = `blur(${Math.max(6, Math.round(Math.max(w, h) / 12))}px)`;
      ctx.drawImage(c, x - pad, y - pad, w + 2 * pad, h + 2 * pad, x - pad, y - pad, w + 2 * pad, h + 2 * pad);
      ctx.restore();
    } else {
      // pixelate: shrink to coarse blocks then scale back up without smoothing
      const block = Math.max(8, Math.round(Math.max(w, h) / 12));
      const small = canvas(Math.max(1, Math.round(w / block)), Math.max(1, Math.round(h / block)));
      small.ctx.drawImage(c, x, y, w, h, 0, 0, small.c.width, small.c.height);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small.c, 0, 0, small.c.width, small.c.height, x, y, w, h);
      ctx.restore();
    }
  }
  return [await exportCanvas(c, inputFormat(f), `${baseName(f.name)}_blurred`)];
}
