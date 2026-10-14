"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Box } from "@/lib/editorTypes";
import { BoxDrawOverlay, type DrawnBox, type EditorProps, PageNav, PdfPage, usePdfDoc } from "./shared";

type PageBox = DrawnBox & { page: number };

export default function RedactEditor({ files, onChange, t }: EditorProps<Box[]>) {
  const { doc } = usePdfDoc(files[0]);
  const [page, setPage] = useState(0);
  const [boxes, setBoxes] = useState<PageBox[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    onChange(boxes.map(({ page, x, y, w, h }) => ({ page, x, y, w, h })));
  }, [boxes, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        setBoxes((all) => all.filter((b) => b.id !== selected));
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const onPage = boxes.filter((b) => b.page === page);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.editors.redactHint}</p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold">{boxes.length} {t.editors.areas}</span>
        {selected && (
          <button onClick={() => { setBoxes((all) => all.filter((b) => b.id !== selected)); setSelected(null); }} className="flex items-center gap-1.5 font-semibold text-brand">
            <Trash2 className="h-4 w-4" /> {t.editors.editDeleteSel}
          </button>
        )}
        {boxes.length > 0 && (
          <button onClick={() => { setBoxes([]); setSelected(null); }} className="ml-auto font-semibold text-muted hover:text-ink">
            {t.editors.clearAll}
          </button>
        )}
      </div>
      <div className="space-y-3 rounded-2xl bg-canvas p-4">
        {doc && <PageNav page={page} count={doc.numPages} setPage={(p) => { setPage(p); setSelected(null); }} t={t} />}
        {doc && (
          <PdfPage doc={doc} pageIndex={page}>
            {() => (
              <BoxDrawOverlay
                boxes={onPage}
                onChange={(next) => setBoxes([...boxes.filter((b) => b.page !== page), ...next.map((b) => ({ ...b, page }))])}
                selected={selected}
                onSelect={setSelected}
                boxClassName="bg-black"
              />
            )}
          </PdfPage>
        )}
      </div>
    </div>
  );
}
