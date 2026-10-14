export interface OutputFile {
  name: string;
  blob: Blob;
}

export type Options = Record<string, string | number | boolean>;

export function baseName(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Parse "1,3-5,8-" into zero-based page indices (in order, duplicates kept out).
 * Empty spec = all pages.
 */
export function parsePages(spec: string, total: number): number[] {
  const trimmed = spec.trim();
  if (!trimmed) return Array.from({ length: total }, (_, i) => i);
  const out: number[] = [];
  const seen = new Set<number>();
  for (const group of parseRangeGroups(trimmed, total)) {
    for (const i of group) {
      if (!seen.has(i)) {
        seen.add(i);
        out.push(i);
      }
    }
  }
  if (!out.length) throw new Error(`No valid pages in "${spec}" (document has ${total} pages)`);
  return out;
}

/** Each comma-separated segment becomes its own group of zero-based indices. */
export function parseRangeGroups(spec: string, total: number): number[][] {
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => {
      const m = seg.match(/^(\d*)\s*(?:-\s*(\d*))?$/);
      if (!m) throw new Error(`Invalid range "${seg}"`);
      const isRange = seg.includes("-");
      const start = m[1] ? parseInt(m[1], 10) : 1;
      const end = isRange ? (m[2] ? parseInt(m[2], 10) : total) : start;
      const lo = Math.max(1, Math.min(start, end));
      const hi = Math.min(total, Math.max(start, end));
      const group: number[] = [];
      for (let p = lo; p <= hi; p++) group.push(p - 1);
      return group;
    })
    .filter((g) => g.length > 0);
}

export function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function zipOutputs(outputs: OutputFile[]): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Set<string>();
  for (const o of outputs) {
    let name = o.name;
    for (let i = 2; used.has(name); i++) name = `${baseName(o.name)} (${i}).${extOf(o.name)}`;
    used.add(name);
    zip.file(name, o.blob);
  }
  return zip.generateAsync({ type: "blob" });
}
