"use client";

import type { Dict } from "@/i18n";
import type { Options } from "@/lib/files";
import type { OptionDef } from "@/lib/tools";

function visible(def: OptionDef, values: Options): boolean {
  if (!def.showIf) return true;
  const v = String(values[def.showIf.key]);
  return Array.isArray(def.showIf.equals) ? def.showIf.equals.includes(v) : def.showIf.equals === v;
}

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand";

export function OptionsForm({
  defs,
  values,
  onChange,
  t,
}: {
  defs: OptionDef[];
  values: Options;
  onChange: (next: Options) => void;
  t: Dict;
}) {
  const set = (key: string, v: string | number | boolean) => onChange({ ...values, [key]: v });
  const label = (key: string) => t.options[key as keyof Dict["options"]] ?? key;
  const valueLabel = (v: string) => t.values[v] ?? v;

  return (
    <div className="space-y-4">
      {defs.filter((d) => visible(d, values)).map((d) => {
        const id = `opt-${d.key}`;
        if (d.type === "checkbox") {
          return (
            <label key={d.key} className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={Boolean(values[d.key])} onChange={(e) => set(d.key, e.target.checked)} className="h-4 w-4 accent-brand" />
              {label(d.key)}
            </label>
          );
        }
        return (
          <div key={d.key}>
            <label htmlFor={id} className="mb-1.5 flex justify-between text-sm font-semibold">
              <span>{label(d.key)}</span>
              {d.type === "range" && (
                <span className="font-mono text-muted">
                  {/* ranges without a unit are 0..1 fractions, shown as percentages */}
                  {d.unit === "%" ? String(values[d.key]) : Math.round(Number(values[d.key]) * 100)}%
                </span>
              )}
            </label>
            {d.type === "select" &&
              (d.options.length <= 3 ? (
                // long labels stack instead of being broken mid-word in narrow columns
                <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(...d.options.map((o) => valueLabel(o).length)) > 10 ? 1 : d.options.length}, minmax(0, 1fr))` }}>
                  {d.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => set(d.key, o)}
                      className={`rounded-lg border px-2 py-2 text-xs font-semibold leading-tight transition ${
                        values[d.key] === o ? "border-brand bg-brand/5 text-brand" : "border-line bg-surface hover:border-ink/30"
                      }`}
                    >
                      {valueLabel(o)}
                    </button>
                  ))}
                </div>
              ) : (
                <select id={id} value={String(values[d.key])} onChange={(e) => set(d.key, e.target.value)} className={input}>
                  {d.options.map((o) => (
                    <option key={o} value={o}>{valueLabel(o)}</option>
                  ))}
                </select>
              ))}
            {d.type === "number" && (
              <input
                id={id}
                type="number"
                min={d.min}
                max={d.max}
                step={d.step ?? 1}
                value={Number(values[d.key])}
                onChange={(e) => set(d.key, e.target.value === "" ? 0 : Number(e.target.value))}
                className={input}
              />
            )}
            {d.type === "range" && (
              <input
                id={id}
                type="range"
                min={d.min}
                max={d.max}
                step={d.step}
                value={Number(values[d.key])}
                onChange={(e) => set(d.key, Number(e.target.value))}
                className="w-full accent-brand"
              />
            )}
            {d.type === "text" && (
              <input
                id={id}
                type={d.password ? "password" : "text"}
                autoComplete={d.password ? "new-password" : "off"}
                placeholder={d.placeholder}
                value={String(values[d.key])}
                onChange={(e) => set(d.key, e.target.value)}
                className={input}
              />
            )}
            {d.type === "color" && (
              <input
                id={id}
                type="color"
                value={String(values[d.key])}
                onChange={(e) => set(d.key, e.target.value)}
                className="h-10 w-full cursor-pointer rounded-lg border border-line bg-surface p-1"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
