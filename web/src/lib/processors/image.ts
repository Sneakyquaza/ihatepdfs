import type { CropRect } from "../editorTypes";
import { baseName, type Options, type OutputFile } from "../files";
import { AppError } from "../errors";
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

export async function removeBg(files: File[], o: Options, onProgress?: (msg: string) => void): Promise<OutputFile[]> {
  const { removeBackground } = await import("@imgly/background-removal");
  const outs: OutputFile[] = [];
  for (const f of files) {
    const cut = await removeBackground(f, {
      output: { format: "image/png" },
      progress: (key: string, current: number, total: number) => {
        if (key.startsWith("fetch") && total) onProgress?.(`${Math.round((current / total) * 100)}%`);
      },
    });
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
