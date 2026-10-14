"use client";

import { useEffect, useRef, useState } from "react";
import type { CropRect } from "@/lib/editorTypes";
import { extOf } from "@/lib/files";
import { openPdf, renderPage } from "@/lib/pdfjs";
import { useObjectUrl } from "@/lib/useObjectUrl";
import { EditorError, type EditorProps } from "./shared";

const RATIOS: [string, number | null][] = [
  ["free", null], ["1:1", 1], ["4:3", 4 / 3], ["3:2", 3 / 2], ["16:9", 16 / 9], ["9:16", 9 / 16], ["4:5", 4 / 5],
];
type Handle = "move" | "nw" | "ne" | "sw" | "se";
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function CropEditor({ files, onChange, t }: EditorProps<CropRect>) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState<CropRect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [ratio, setRatio] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const isPdf = extOf(files[0].name) === "pdf" || files[0].type === "application/pdf";
  const imageUrl = useObjectUrl(isPdf ? null : files[0]);
  const url = imageUrl ?? pdfUrl;

  useEffect(() => {
    if (!isPdf) return;
    // PDF: crop is drawn on a render of page 1 and applied to every page
    let alive = true;
    (async () => {
      const doc = await openPdf(files[0]);
      const page = await doc.getPage(1);
      const canvas = await renderPage(doc, 1, 1400 / page.getViewport({ scale: 1 }).width);
      await doc.destroy();
      if (alive) setPdfUrl(canvas.toDataURL("image/jpeg", 0.85));
    })().catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [files, isPdf]);

  useEffect(() => onChange(rect), [rect, onChange]);

  /** ratio is in pixels; convert to fraction space using the image size. */
  const fracRatio = ratio && size ? (ratio * size.h) / size.w : null;

  const applyRatio = (r: number | null) => {
    setRatio(r);
    if (!r || !size) return;
    const fr = (r * size.h) / size.w;
    let w = 0.8, h = w / fr;
    if (h > 0.8) { h = 0.8; w = h * fr; }
    setRect({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  };

  const start = (e: React.PointerEvent, handle: Handle) => {
    e.preventDefault();
    e.stopPropagation();
    const bounds = boxRef.current!.getBoundingClientRect();
    const s = rect;
    const sx = e.clientX, sy = e.clientY;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / bounds.width;
      const dy = (ev.clientY - sy) / bounds.height;
      if (handle === "move") {
        setRect({ ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) });
        return;
      }
      // anchor = opposite corner
      const left = handle.includes("w");
      const top = handle.includes("n");
      const ax = left ? s.x + s.w : s.x;
      const ay = top ? s.y + s.h : s.y;
      let px = clamp((left ? s.x : s.x + s.w) + dx, 0, 1);
      let py = clamp((top ? s.y : s.y + s.h) + dy, 0, 1);
      let w = Math.max(0.02, Math.abs(px - ax));
      let h = Math.max(0.02, Math.abs(py - ay));
      if (fracRatio) {
        h = w / fracRatio;
        const maxH = top ? ay : 1 - ay;
        if (h > maxH) { h = maxH; w = h * fracRatio; }
        px = left ? ax - w : ax + w;
        py = top ? ay - h : ay + h;
      }
      setRect({ x: Math.min(ax, px), y: Math.min(ay, py), w, h });
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const pct = (v: number) => `${v * 100}%`;
  const corner = (h: Handle, cls: string) => (
    <span onPointerDown={(e) => start(e, h)} className={`absolute h-4 w-4 rounded-sm border-2 border-white bg-brand ${cls}`} />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{t.editors.cropRatio}</span>
        {RATIOS.map(([label, r]) => (
          <button key={label} onClick={() => applyRatio(r)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${ratio === r ? "bg-ink text-canvas" : "bg-canvas hover:bg-ink/5"}`}>
            {r === null ? t.editors.cropFree : label}
          </button>
        ))}
        {size && !isPdf && (
          <span className="ml-auto font-mono text-sm text-muted">
            {Math.round(rect.w * size.w)} × {Math.round(rect.h * size.h)} px
          </span>
        )}
      </div>
      <EditorError error={error} t={t} />
      <p className="text-sm text-muted">{t.editors.cropHint}{isPdf && ` ${t.editors.cropPdfHint}`}</p>
      <div className="checker flex justify-center rounded-2xl p-4">
        <div ref={boxRef} className="relative inline-block touch-none select-none overflow-hidden">
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" draggable={false} onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} className="block max-h-[65vh] max-w-full" />
          )}
          {/* dim outside the crop with a giant box-shadow */}
          <div
            onPointerDown={(e) => start(e, "move")}
            className="absolute cursor-move border-2 border-white"
            style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h), boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }}
          >
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => <div key={i} className="border border-white/30" />)}
            </div>
            {corner("nw", "left-0 top-0 cursor-nwse-resize")}
            {corner("ne", "right-0 top-0 cursor-nesw-resize")}
            {corner("sw", "bottom-0 left-0 cursor-nesw-resize")}
            {corner("se", "bottom-0 right-0 cursor-nwse-resize")}
          </div>
        </div>
      </div>
    </div>
  );
}
