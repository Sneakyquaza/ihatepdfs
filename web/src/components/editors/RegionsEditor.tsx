"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { CropRect } from "@/lib/editorTypes";
import { BoxDrawOverlay, type DrawnBox, type EditorProps } from "./shared";

export default function RegionsEditor({ files, onChange, t }: EditorProps<CropRect[]>) {
  const [url, setUrl] = useState("");
  const [boxes, setBoxes] = useState<DrawnBox[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(files[0]);
    setUrl(u);
    setBoxes([]);
    return () => URL.revokeObjectURL(u);
  }, [files]);

  useEffect(() => onChange(boxes.map(({ x, y, w, h }) => ({ x, y, w, h }))), [boxes, onChange]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.editors.regionsHint}</p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold">{boxes.length} {t.editors.areas}</span>
        {selected && (
          <button onClick={() => { setBoxes((b) => b.filter((x) => x.id !== selected)); setSelected(null); }} className="flex items-center gap-1.5 font-semibold text-brand">
            <Trash2 className="h-4 w-4" /> {t.editors.editDeleteSel}
          </button>
        )}
      </div>
      <div className="checker flex justify-center rounded-2xl p-4">
        <div className="relative inline-block select-none">
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" draggable={false} className="block max-h-[65vh] max-w-full" />
          )}
          <BoxDrawOverlay boxes={boxes} onChange={setBoxes} selected={selected} onSelect={setSelected} boxClassName="bg-white/30 ring-2 ring-white backdrop-blur-md" />
        </div>
      </div>
    </div>
  );
}
