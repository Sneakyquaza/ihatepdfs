import { AppError } from "./errors";
import { extOf } from "./files";

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/** True for HEIC/HEIF files: by extension, MIME type or the `ftyp` brand in the first bytes. */
export async function isHeicFile(file: File): Promise<boolean> {
  if (/^image\/hei[cf]/.test(file.type) || ["heic", "heif"].includes(extOf(file.name))) return true;
  if (file.type && file.type !== "application/octet-stream") return false;
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const brand = String.fromCharCode(...head.slice(8, 12));
  return String.fromCharCode(...head.slice(4, 8)) === "ftyp" && HEIC_BRANDS.has(brand);
}

/** Decodes a HEIC/HEIF photo to a full-resolution, upright JPEG (libheif applies irot/imir). */
export async function heicToJpeg(file: File): Promise<File> {
  try {
    // the csp build embeds the wasm (no remote fetch, no eval); lazily loaded only when a HEIC file shows up
    const { heicTo } = await import("heic-to/csp");
    const blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
    const base = file.name.replace(/\.[^./\\]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch (e) {
    console.error(e);
    throw new AppError("heic_failed", { name: file.name });
  }
}
