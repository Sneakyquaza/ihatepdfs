import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import type { Dict } from "@/i18n";
import { formatBytes } from "@/lib/files";
import type { Tool } from "@/lib/tools";
import { FileThumb } from "../FileThumb";

/** Selected files with reorder (order matters for merge, image→PDF, compare) and remove. */
export function FileGrid({
  tool, files, t, onMove, onRemove, onAdd,
}: {
  tool: Tool;
  files: File[];
  t: Dict;
  onMove: (i: number, d: -1 | 1) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
}) {
  const reorderable = tool.multiple && files.length > 1;
  const canAdd = (tool.multiple || !files.length) && (!tool.maxFiles || files.length < tool.maxFiles);
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {files.map((f, i) => (
        <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`} className="group relative rounded-2xl bg-canvas p-3">
          <FileThumb file={f} className="aspect-[3/4] rounded-lg" />
          <p className="mt-2 truncate text-xs font-semibold" title={f.name}>{f.name}</p>
          <p className="text-xs text-muted">{formatBytes(f.size)}</p>
          {/* always visible on touch screens, on hover/focus elsewhere */}
          <div className="absolute right-2 top-2 flex gap-1 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
            {reorderable && (
              <>
                <button onClick={() => onMove(i, -1)} disabled={i === 0} className="rounded-full bg-surface p-1 shadow disabled:opacity-30" aria-label={t.runner.moveUp}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => onMove(i, 1)} disabled={i === files.length - 1} className="rounded-full bg-surface p-1 shadow disabled:opacity-30" aria-label={t.runner.moveDown}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
            <button onClick={() => onRemove(i)} className="rounded-full bg-surface p-1 text-accent shadow" aria-label={`${t.runner.remove} ${f.name}`}>
              <X className="h-4 w-4" />
            </button>
          </div>
          {reorderable && (
            <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-ink text-xs font-bold text-canvas">{i + 1}</span>
          )}
        </li>
      ))}
      {canAdd && (
        <li>
          <button
            onClick={onAdd}
            className="grid aspect-[3/4] w-full place-items-center rounded-2xl border-2 border-dashed border-line text-muted transition hover:border-brand hover:text-accent"
          >
            <span className="flex flex-col items-center gap-2 text-sm font-semibold">
              <Plus className="h-8 w-8" />
              {files.length ? t.runner.addMore : t.runner.selectOne}
            </span>
          </button>
        </li>
      )}
    </ul>
  );
}
