"use client";

import { useCallback, useEffect, useState } from "react";
import { TOOL_MAP } from "./tools";

// Per-browser conveniences only; storage can be unavailable (private mode, blocked site data).
const RECENT = "ihp:recent";
const FAVORITES = "ihp:favorites";
const MAX_RECENT = 8;
const EVENT = "ihp:prefs";

function read(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x in TOOL_MAP) : [];
  } catch {
    return [];
  }
}

function write(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage unavailable: feature silently off */
  }
}

export function pushRecent(id: string) {
  write(RECENT, [id, ...read(RECENT).filter((x) => x !== id)].slice(0, MAX_RECENT));
}

export function usePrefs() {
  const [recent, setRecent] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => {
      setRecent(read(RECENT));
      setFavorites(read(FAVORITES));
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync); // other tabs
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    const cur = read(FAVORITES);
    write(FAVORITES, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }, []);

  return { recent, favorites, toggleFavorite };
}
