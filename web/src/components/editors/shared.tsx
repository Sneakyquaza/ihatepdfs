"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Dict } from "@/i18n";
import { openPdf } from "@/lib/pdfjs";

export interface EditorProps<T> {
  files: File[];
  onChange: (data: T) => void;
  t: Dict;
}

export function usePdfDoc(file: File | undefined) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) return;
    let alive = true;
    let opened: PDFDocumentProxy | null = null;
    openPdf(file)
      .then((d) => {
        opened = d;
        if (alive) setDoc(d);
        else d.destroy();
      })
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => {
      alive = false;
      opened?.destroy();
      setDoc(null);
    };
  }, [file]);
  return { doc, error };
}

export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export interface PageGeometry {
  cssW: number; // displayed width in CSS px
  cssH: number;
  ptW: number; // displayed width in PDF points (rotation applied)
  ptH: number;
}

/** Renders one PDF page fitted to the container width, with an overlay slot sized exactly like the page. */
export function PdfPage({
  doc,
  pageIndex,
  maxWidth = 900,
  children,
}: {
  doc: PDFDocumentProxy;
  pageIndex: number;
  maxWidth?: number;
  children?: (g: PageGeometry) => ReactNode;
}) {
  const [wrapRef, wrapW] = useElementWidth<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [geom, setGeom] = useState<PageGeometry | null>(null);

  useEffect(() => {
    if (!wrapW) return;
    let cancelled = false;
    let task: { cancel(): void } | null = null;
    (async () => {
      const page = await doc.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const cssW = Math.min(wrapW, maxWidth);
      const scale = cssW / base.width;
      const dpr = window.devicePixelRatio || 1;
      const vp = page.getViewport({ scale: scale * dpr });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${(cssW * base.height) / base.width}px`;
      const render = page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp });
      task = render;
      try {
        await render.promise;
      } catch {
        return; // cancelled by a newer render
      }
      if (!cancelled) setGeom({ cssW, cssH: (cssW * base.height) / base.width, ptW: base.width, ptH: base.height });
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageIndex, wrapW, maxWidth]);

  return (
    <div ref={wrapRef} className="flex w-full justify-center">
      <div className="relative bg-white shadow-md ring-1 ring-black/10">
        <canvas ref={canvasRef} className="block" />
        {!geom && (
          <div className="absolute inset-0 grid min-h-40 min-w-40 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        )}
        {geom && children && <div className="absolute inset-0">{children(geom)}</div>}
      </div>
    </div>
  );
}

export function PageNav({ page, count, setPage, t }: { page: number; count: number; setPage: (p: number) => void; t: Dict }) {
  if (count <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 text-sm font-semibold">
      <button disabled={page <= 0} onClick={() => setPage(page - 1)} className="rounded-full p-2 hover:bg-black/5 disabled:opacity-30" aria-label={t.editors.prev}>
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span>
        {t.editors.page} {page + 1} / {count}
      </span>
      <button disabled={page >= count - 1} onClick={() => setPage(page + 1)} className="rounded-full p-2 hover:bg-black/5 disabled:opacity-30" aria-label={t.editors.next}>
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

export interface FracBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Drag to move, drag the bottom-right handle to resize. Coordinates are fractions of the container.
 * `aspect` (w/h in container-fraction units) locks the ratio while resizing.
 */
export function startBoxDrag(
  e: React.PointerEvent,
  box: FracBox,
  mode: "move" | "resize",
  onChange: (b: FracBox) => void,
  aspect?: number,
) {
  e.preventDefault();
  e.stopPropagation();
  const container = (e.currentTarget as HTMLElement).closest("[data-overlay]") as HTMLElement;
  const rect = container.getBoundingClientRect();
  const sx = e.clientX;
  const sy = e.clientY;
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  const onMove = (ev: PointerEvent) => {
    const dx = (ev.clientX - sx) / rect.width;
    const dy = (ev.clientY - sy) / rect.height;
    if (mode === "move") {
      onChange({ ...box, x: clamp(box.x + dx, 0, 1 - box.w), y: clamp(box.y + dy, 0, 1 - box.h) });
    } else {
      let w = clamp(box.w + dx, 0.02, 1 - box.x);
      let h = aspect ? w / aspect : clamp(box.h + dy, 0.01, 1 - box.y);
      if (aspect && box.y + h > 1) {
        h = 1 - box.y;
        w = h * aspect;
      }
      onChange({ ...box, w, h });
    }
  };
  const onUp = () => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onUp);
  };
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
}

export const uid = () => Math.random().toString(36).slice(2, 10);
