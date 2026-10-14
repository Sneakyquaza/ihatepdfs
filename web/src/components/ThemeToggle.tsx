"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

type Mode = "system" | "light" | "dark";
const KEY = "ihp:theme";
const ORDER: Mode[] = ["system", "light", "dark"];

/** Runs inline in <head> before paint (no flash); keep in sync with apply() below. */
export const THEME_SCRIPT = `try{var m=localStorage.getItem("${KEY}");var d=m==="dark"||(m!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}`;

function apply(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function readMode(): Mode {
  try {
    const m = localStorage.getItem(KEY);
    return m === "light" || m === "dark" ? m : "system";
  } catch {
    return "system";
  }
}

const EVENT = "ihp:theme";
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function ThemeToggle({ labels }: { labels: Record<Mode, string> }) {
  // server snapshot is "system", so hydration matches; the client then switches to the stored mode
  const mode = useSyncExternalStore(subscribe, readMode, () => "system" as Mode);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const next = () => {
    const m = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    apply(m);
    try {
      if (m === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, m);
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
    window.dispatchEvent(new Event(EVENT));
  };

  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;
  return (
    <button onClick={next} className="rounded-full p-2 text-muted hover:bg-ink/5 hover:text-ink" aria-label={labels[mode]} title={labels[mode]}>
      <Icon className="h-5 w-5" />
    </button>
  );
}
