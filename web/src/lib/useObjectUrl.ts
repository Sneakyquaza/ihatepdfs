"use client";

import { useEffect, useMemo } from "react";

// Revocations are deferred so React StrictMode's mount → unmount → mount check doesn't revoke a URL still in use.
const pending = new Map<string, number>();

/** Object URL for a blob, revoked when the blob changes or the component unmounts. */
export function useObjectUrl(blob: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => {
    if (!url) return;
    const timer = pending.get(url);
    if (timer !== undefined) {
      clearTimeout(timer);
      pending.delete(url);
    }
    return () => {
      pending.set(url, window.setTimeout(() => {
        URL.revokeObjectURL(url);
        pending.delete(url);
      }, 0));
    };
  }, [url]);
  return url;
}
