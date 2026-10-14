"use client";

import { Loader2, RotateCw, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { OrganizeItem } from "@/lib/editorTypes";
import { openPdf, renderPage } from "@/lib/pdfjs";
import { EditorError, type EditorProps, uid } from "./shared";

interface Item extends OrganizeItem {
  id: string;
  thumb: string;
  deleted: boolean;
}

const PALETTE = ["#7c3aed", "#1c7ed6", "#2f9e44", "#f08c00", "#7048e8", "#0c8599"];

export default function OrganizeEditor({ files, onChange, t }: EditorProps<OrganizeItem[]>) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    // the editor is remounted when files change (key in ToolRunner), so state starts fresh
    let alive = true;
    (async () => {
      const all: Item[] = [];
      for (const [fi, f] of files.entries()) {
        const doc = await openPdf(f);
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          const canvas = await renderPage(doc, p, 180 / page.getViewport({ scale: 1 }).width);
          all.push({ id: uid(), file: fi, page: p - 1, rotation: 0, deleted: false, thumb: canvas.toDataURL("image/jpeg", 0.75) });
          if (alive && p % 8 === 0) setItems([...all]); // progressive display for big files
        }
        await doc.destroy();
      }
      if (alive) {
        setItems(all);
        setLoading(false);
      }
    })().catch((e) => {
      if (!alive) return;
      setError(e);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [files]);

  useEffect(() => {
    onChange(items.filter((i) => !i.deleted).map(({ file, page, rotation }) => ({ file, page, rotation })));
  }, [items, onChange]);

  const update = (id: string, fn: (i: Item) => Item) => setItems((prev) => prev.map((i) => (i.id === id ? fn(i) : i)));

  const drop = (targetId: string) => {
    const from = dragId.current;
    dragId.current = null;
    setOverId(null);
    if (!from || from === targetId) return;
    setItems((prev) => {
      const next = [...prev];
      const fi = next.findIndex((i) => i.id === from);
      const [moved] = next.splice(fi, 1);
      next.splice(next.findIndex((i) => i.id === targetId), 0, moved);
      return next;
    });
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted">{t.editors.organizeHint}</p>
      <EditorError error={error} t={t} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
        {items.map((it, idx) => (
          <div
            key={it.id}
            draggable={!it.deleted}
            onDragStart={(e) => {
              dragId.current = it.id;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", it.id); // Firefox needs data to start a drag
            }}
            onDragOver={(e) => {
              if (!dragId.current) return;
              e.preventDefault();
              e.stopPropagation();
              setOverId(it.id);
            }}
            onDrop={(e) => {
              if (!dragId.current) return;
              e.preventDefault();
              e.stopPropagation();
              drop(it.id);
            }}
            onDragEnd={() => {
              dragId.current = null;
              setOverId(null);
            }}
            className={`group relative cursor-grab rounded-xl bg-canvas p-2 transition active:cursor-grabbing ${
              overId === it.id ? "ring-2 ring-brand" : ""
            } ${it.deleted ? "opacity-40" : ""}`}
          >
            <div className="grid aspect-square place-items-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.thumb}
                alt=""
                draggable={false}
                className="max-h-full max-w-full shadow-sm transition-transform"
                style={{ transform: `rotate(${it.rotation}deg)` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1">
                {files.length > 1 && <span className="h-2 w-2 rounded-full" style={{ background: PALETTE[it.file % PALETTE.length] }} />}
                {idx + 1}
              </span>
              <span className="text-muted">p.{it.page + 1}</span>
            </div>
            <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
              {!it.deleted ? (
                <>
                  <button onClick={() => update(it.id, (i) => ({ ...i, rotation: (i.rotation + 90) % 360 }))} className="rounded-full bg-surface p-1.5 shadow" aria-label={t.editors.rotate}>
                    <RotateCw className="h-4 w-4" />
                  </button>
                  <button onClick={() => update(it.id, (i) => ({ ...i, deleted: true }))} className="rounded-full bg-surface p-1.5 text-accent shadow" aria-label={t.editors.delete}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button onClick={() => update(it.id, (i) => ({ ...i, deleted: false }))} className="rounded-full bg-surface p-1.5 shadow" aria-label={t.editors.restore}>
                  <Undo2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="grid aspect-square place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        )}
      </div>
    </div>
  );
}
