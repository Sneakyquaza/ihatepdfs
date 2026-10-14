import { Upload } from "lucide-react";
import type { Dict } from "@/i18n";
import type { Tool } from "@/lib/tools";
import { ToolIcon } from "../ToolIcon";

export function ToolHeader({ tool, t }: { tool: Tool; t: Dict }) {
  const info = t.tools[tool.id as keyof Dict["tools"]];
  return (
    <div className="text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: `${tool.color}18`, color: tool.color }}>
        <ToolIcon name={tool.icon} className="h-7 w-7" />
      </span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{info.name}</h1>
      <p className="mx-auto mt-2 max-w-xl text-muted">{info.desc}</p>
    </div>
  );
}

/** Empty state: big "select files" call to action. */
export function UploadHero({ tool, t, onPick, modeBadge }: { tool: Tool; t: Dict; onPick: () => void; modeBadge: React.ReactNode }) {
  return (
    <>
      <div className="mt-6">
        <ToolHeader tool={tool} t={t} />
      </div>
      <div className="mt-10 flex flex-col items-center">
        <button
          onClick={onPick}
          className="inline-flex items-center gap-3 rounded-2xl bg-brand px-10 py-5 text-xl font-bold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-dark"
        >
          <Upload className="h-6 w-6" />
          {tool.multiple ? t.runner.select : t.runner.selectOne}
        </button>
        <p className="mt-3 text-sm text-muted">{t.runner.drop}</p>
        <div className="mt-6">{modeBadge}</div>
        {tool.id === "remove-bg" && <p className="mt-2 text-xs text-muted">{t.runner.firstRunModel}</p>}
      </div>
    </>
  );
}

export function DropOverlay({ t }: { t: Dict }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-brand/10 backdrop-blur-sm">
      <div className="rounded-3xl border-4 border-dashed border-brand bg-surface/90 px-16 py-12 text-center">
        <Upload className="mx-auto h-12 w-12 text-accent" />
        <p className="mt-3 text-lg font-bold">{t.runner.drop}</p>
      </div>
    </div>
  );
}
