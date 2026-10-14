"use client";

import { Eraser, Highlighter, MousePointer2, Square, Trash2, Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EditItem } from "@/lib/editorTypes";
import { type EditorProps, PageNav, PdfPage, type PageGeometry, startBoxDrag, uid, usePdfDoc } from "./shared";

type Kind = EditItem["kind"];
type Item = EditItem & { id: string };
type ToolKind = Kind | "select";

const LINE = 1.2;
let measureCtx: CanvasRenderingContext2D | null = null;

/** Width/height of a (multi-line) text block as fractions of the page, using Helvetica-like metrics. */
function textBox(text: string, size: number, g: PageGeometry) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  measureCtx!.font = `${size}px Helvetica, Arial, sans-serif`;
  const lines = text.split("\n");
  const wPt = Math.max(...lines.map((l) => measureCtx!.measureText(l || " ").width));
  return { w: Math.min(1, wPt / g.ptW + 0.01), h: (lines.length * size * LINE) / g.ptH };
}

export default function EditPdfEditor({ files, onChange, t }: EditorProps<EditItem[]>) {
  const { doc } = usePdfDoc(files[0]);
  const [page, setPage] = useState(0);
  const [tool, setTool] = useState<ToolKind>("text");
  const [color, setColor] = useState("#e5322d");
  const [size, setSize] = useState(16);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Item | null>(null);
  const geomRef = useRef<PageGeometry | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onChange(items.map(({ id, ...rest }) => rest as EditItem));
  }, [items, onChange]);

  const sel = items.find((i) => i.id === selected) ?? null;
  const patch = (id: string, p: Partial<Item>) =>
    setItems((all) =>
      all.map((i) => {
        if (i.id !== id) return i;
        const next = { ...i, ...p } as Item;
        if (next.kind === "text" && geomRef.current && ("text" in p || "size" in p)) {
          Object.assign(next, textBox(next.text, next.size, geomRef.current));
        }
        return next;
      }),
    );

  const remove = () => {
    if (!selected) return;
    setItems((all) => all.filter((i) => i.id !== selected));
    setSelected(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) remove();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onOverlayDown = (e: React.PointerEvent<HTMLDivElement>, g: PageGeometry) => {
    if (e.target !== e.currentTarget) return;
    setSelected(null);
    if (tool === "select") return;
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;

    if (tool === "text") {
      const text = t.editors.editTextPrompt;
      const item: Item = { id: uid(), kind: "text", page, x: fx, y: fy, text, size, color, ...textBox(text, size, g) };
      setItems((all) => [...all, item]);
      setSelected(item.id);
      setTool("select");
      return;
    }

    // shapes: drag to draw
    const base = { id: uid(), page, x: fx, y: fy, w: 0, h: 0 };
    const make = (b: typeof base): Item =>
      tool === "whiteout" ? { ...b, kind: "whiteout" } : tool === "highlight" ? { ...b, kind: "highlight", color: "#ffd43b" } : { ...b, kind: "rect", color };
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    let current = make(base);
    setDraft(current);
    const move = (ev: PointerEvent) => {
      const cx = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      const cy = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
      current = make({ ...base, x: Math.min(fx, cx), y: Math.min(fy, cy), w: Math.abs(cx - fx), h: Math.abs(cy - fy) });
      setDraft(current);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setDraft(null);
      if (current.w < 0.01 || current.h < 0.005) current = { ...current, w: 0.2, h: 0.05 } as Item;
      setItems((all) => [...all, current]);
      setSelected(current.id);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const renderItem = (it: Item, g: PageGeometry, isDraft = false) => {
    const pxPerPt = g.cssW / g.ptW;
    const style: React.CSSProperties = { left: `${it.x * 100}%`, top: `${it.y * 100}%`, width: `${it.w * 100}%`, height: `${it.h * 100}%` };
    const isSel = selected === it.id;
    const box =
      it.kind === "whiteout" ? "bg-white ring-1 ring-black/10"
      : it.kind === "highlight" ? ""
      : it.kind === "rect" ? "border-2"
      : "";
    return (
      <div
        key={it.id}
        className={`absolute ${isDraft ? "" : "cursor-move"} ${box} ${isSel ? "outline-2 outline-dashed outline-brand" : ""}`}
        style={{
          ...style,
          ...(it.kind === "highlight" ? { background: it.color, opacity: 0.35 } : {}),
          ...(it.kind === "rect" ? { borderColor: it.color } : {}),
        }}
        onPointerDown={isDraft ? undefined : (e) => {
          setSelected(it.id);
          startBoxDrag(e, it, "move", (b) => patch(it.id, b));
        }}
      >
        {it.kind === "text" && (
          <div
            className="pointer-events-none whitespace-pre"
            style={{ color: it.color, fontSize: it.size * pxPerPt, lineHeight: LINE, fontFamily: "Helvetica, Arial, sans-serif" }}
          >
            {it.text}
          </div>
        )}
        {!isDraft && it.kind !== "text" && isSel && (
          <span
            className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-white bg-brand"
            onPointerDown={(e) => startBoxDrag(e, it, "resize", (b) => patch(it.id, b))}
          />
        )}
      </div>
    );
  };

  const toolBtn = (k: ToolKind, Icon: typeof Type, label: string) => (
    <button onClick={() => setTool(k)} title={label} aria-label={label} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tool === k ? "bg-ink text-white" : "bg-white hover:bg-black/5"}`}>
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl bg-canvas p-2">
        <div className="flex flex-wrap items-center gap-2">
          {toolBtn("select", MousePointer2, t.editors.editSelect)}
          {toolBtn("text", Type, t.editors.editText)}
          {toolBtn("rect", Square, t.editors.editRect)}
          {toolBtn("whiteout", Eraser, t.editors.editWhiteout)}
          {toolBtn("highlight", Highlighter, t.editors.editHighlight)}
          <span className="mx-1 h-6 w-px bg-black/10" />
          <input type="color" aria-label={t.options.color} value={sel && "color" in sel ? sel.color : color} onChange={(e) => { setColor(e.target.value); if (sel && "color" in sel) patch(sel.id, { color: e.target.value }); }} className="h-9 w-9 cursor-pointer rounded-lg border border-black/10 bg-white p-0.5" />
          <input type="number" aria-label={t.options.fontSize} min={6} max={96} value={sel?.kind === "text" ? sel.size : size} onChange={(e) => { const v = Number(e.target.value) || 12; setSize(v); if (sel?.kind === "text") patch(sel.id, { size: v }); }} className="w-16 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm" />
        </div>
        {/* fixed-height row so selecting items never shifts the page below */}
        <div className="flex h-16 items-center gap-2">
          {sel?.kind === "text" ? (
            <textarea
              autoFocus
              value={sel.text}
              onChange={(e) => patch(sel.id, { text: e.target.value })}
              onFocus={(e) => e.target.select()}
              className="h-full flex-1 resize-none rounded-lg border border-brand/40 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
          ) : (
            <p className="flex-1 px-2 text-sm text-muted">{t.editors.editHint}</p>
          )}
          {selected && (
            <button onClick={remove} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/5">
              <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">{t.editors.editDeleteSel}</span>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl bg-canvas p-4">
        {doc && <PageNav page={page} count={doc.numPages} setPage={(p) => { setPage(p); setSelected(null); }} t={t} />}
        {doc && (
          <PdfPage doc={doc} pageIndex={page}>
            {(g) => {
              geomRef.current = g;
              return (
                <div data-overlay className={`absolute inset-0 ${tool === "select" ? "" : "cursor-crosshair"}`} onPointerDown={(e) => onOverlayDown(e, g)}>
                  {items.filter((i) => i.page === page).map((i) => renderItem(i, g))}
                  {draft && renderItem(draft, g, true)}
                </div>
              );
            }}
          </PdfPage>
        )}
      </div>
    </div>
  );
}
