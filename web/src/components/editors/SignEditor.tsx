"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SignPlacement } from "@/lib/editorTypes";
import { type EditorProps, PageNav, PdfPage, startBoxDrag, uid, usePdfDoc } from "./shared";

type Mode = "draw" | "type" | "upload";
interface Placed extends SignPlacement {
  id: string;
  aspect: number; // image width / height in px
}

const FONTS = ['"Brush Script MT", "Segoe Script", cursive', '"Lucida Handwriting", "Apple Chancery", cursive', 'Georgia, serif'];
const INK = ["#1d2b53", "#000000", "#c92a2a"];

/** Crop a canvas to its non-transparent pixels and return a PNG data URL + aspect ratio. */
function trimCanvas(src: HTMLCanvasElement): { url: string; aspect: number } | null {
  const ctx = src.getContext("2d")!;
  const { width, height } = src;
  const data = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return { url: out.toDataURL("image/png"), aspect: out.width / out.height };
}

export default function SignEditor({ files, onChange, t }: EditorProps<SignPlacement[]>) {
  const { doc } = usePdfDoc(files[0]);
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<Mode>("draw");
  const [ink, setInk] = useState(INK[0]);
  const [name, setName] = useState("");
  const [font, setFont] = useState(0);
  const [sig, setSig] = useState<{ url: string; aspect: number } | null>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const padRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    onChange(placed.map(({ page, x, y, w, h, image }) => ({ page, x, y, w, h, image })));
  }, [placed, onChange]);

  // ----- signature pad -----
  const padPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * e.currentTarget.width, ((e.clientY - r.top) / r.height) * e.currentTarget.height];
  };
  const refreshFromPad = useCallback(() => {
    if (padRef.current) setSig(trimCanvas(padRef.current));
  }, []);
  const clearPad = () => {
    const c = padRef.current;
    c?.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setSig(null);
  };

  // ----- typed signature -----
  useEffect(() => {
    if (mode !== "type") return;
    if (!name.trim()) return setSig(null);
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 240;
    const ctx = c.getContext("2d")!;
    ctx.font = `120px ${FONTS[font]}`;
    ctx.fillStyle = ink;
    ctx.textBaseline = "middle";
    ctx.fillText(name, 20, 120, 860);
    setSig(trimCanvas(c));
  }, [mode, name, font, ink]);

  const onUpload = async (file: File) => {
    const bmp = await createImageBitmap(file);
    const c = document.createElement("canvas");
    const s = Math.min(1, 1200 / bmp.width);
    c.width = bmp.width * s;
    c.height = bmp.height * s;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    // knock out near-white background so scanned signatures blend in
    const img = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
      if (lum > 225) img.data[i + 3] = 0;
    }
    ctx.putImageData(img, 0, 0);
    setSig(trimCanvas(c));
  };

  const placeAt = (fx: number, fy: number, ptW: number, ptH: number) => {
    if (!sig) return;
    const w = 0.25;
    const h = (w * ptW) / sig.aspect / ptH;
    const item: Placed = {
      id: uid(), page, image: sig.url, aspect: sig.aspect,
      x: Math.min(Math.max(0, fx - w / 2), 1 - w), y: Math.min(Math.max(0, fy - h / 2), 1 - h), w, h,
    };
    setPlaced((p) => [...p, item]);
    setSelected(item.id);
  };

  const tab = (m: Mode, label: string) => (
    <button onClick={() => { setMode(m); setSig(null); }} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${mode === m ? "bg-white shadow-sm" : "text-muted"}`}>
      {label}
    </button>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
      <div className="space-y-4">
        <p className="text-sm text-muted">{t.editors.signHint}</p>
        <div className="flex gap-1 rounded-xl bg-canvas p-1">
          {tab("draw", t.editors.signDraw)}
          {tab("type", t.editors.signType)}
          {tab("upload", t.editors.signUpload)}
        </div>

        {mode !== "upload" && (
          <div className="flex gap-2">
            {INK.map((c) => (
              <button key={c} onClick={() => setInk(c)} className={`h-7 w-7 rounded-full ring-offset-2 ${ink === c ? "ring-2 ring-ink" : ""}`} style={{ background: c }} aria-label={c} />
            ))}
          </div>
        )}

        {mode === "draw" && (
          <div>
            <canvas
              ref={padRef}
              width={600}
              height={240}
              className="w-full touch-none rounded-xl border-2 border-dashed border-black/15 bg-white"
              onPointerDown={(e) => {
                drawing.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                const ctx = e.currentTarget.getContext("2d")!;
                const [x, y] = padPoint(e);
                ctx.strokeStyle = ink;
                ctx.lineWidth = 4;
                ctx.lineCap = ctx.lineJoin = "round";
                ctx.beginPath();
                ctx.moveTo(x, y);
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return;
                const ctx = e.currentTarget.getContext("2d")!;
                const [x, y] = padPoint(e);
                ctx.lineTo(x, y);
                ctx.stroke();
              }}
              onPointerUp={() => {
                drawing.current = false;
                refreshFromPad();
              }}
            />
            <button onClick={clearPad} className="mt-2 text-sm font-semibold text-muted hover:text-ink">{t.editors.signClear}</button>
          </div>
        )}

        {mode === "type" && (
          <div className="space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.editors.signName} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand" />
            {FONTS.map((f, i) => (
              <button key={f} onClick={() => setFont(i)} className={`block w-full truncate rounded-lg border px-3 py-2 text-left text-2xl ${font === i ? "border-brand" : "border-black/10"}`} style={{ fontFamily: f, color: ink }}>
                {name || "Signature"}
              </button>
            ))}
          </div>
        )}

        {mode === "upload" && (
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} className="block w-full text-sm" />
        )}

        {sig && (
          <div className="checker grid h-24 place-items-center rounded-xl p-2 ring-1 ring-black/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sig.url} alt="" className="max-h-full max-w-full" />
          </div>
        )}

        {selected && (
          <button onClick={() => { setPlaced((p) => p.filter((x) => x.id !== selected)); setSelected(null); }} className="flex items-center gap-2 text-sm font-semibold text-brand">
            <Trash2 className="h-4 w-4" /> {t.editors.editDeleteSel}
          </button>
        )}
      </div>

      <div className="min-w-0 space-y-3 rounded-2xl bg-canvas p-4">
        {doc && <PageNav page={page} count={doc.numPages} setPage={setPage} t={t} />}
        {doc && (
          <PdfPage doc={doc} pageIndex={page}>
            {(g) => (
              <div
                data-overlay
                className={`absolute inset-0 ${sig ? "cursor-copy" : ""}`}
                onPointerDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  setSelected(null);
                  const r = e.currentTarget.getBoundingClientRect();
                  placeAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, g.ptW, g.ptH);
                }}
              >
                {placed.filter((p) => p.page === page).map((p) => (
                  <div
                    key={p.id}
                    className={`absolute cursor-move ${selected === p.id ? "outline-2 outline-dashed outline-brand" : "hover:outline hover:outline-1 hover:outline-brand/50"}`}
                    style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%`, height: `${p.h * 100}%` }}
                    onPointerDown={(e) => {
                      setSelected(p.id);
                      startBoxDrag(e, p, "move", (b) => setPlaced((all) => all.map((x) => (x.id === p.id ? { ...x, ...b } : x))));
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image} alt="" draggable={false} className="pointer-events-none h-full w-full" />
                    <span
                      className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-white bg-brand"
                      onPointerDown={(e) => {
                        setSelected(p.id);
                        startBoxDrag(e, p, "resize", (b) => setPlaced((all) => all.map((x) => (x.id === p.id ? { ...x, ...b } : x))), (p.aspect * g.ptH) / g.ptW);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </PdfPage>
        )}
      </div>
    </div>
  );
}
