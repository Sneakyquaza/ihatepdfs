"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function MobileMenu({ links, label }: { links: { href: string; label: string }[]; label: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  // close when navigating or clicking outside
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative md:hidden">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={label} className="rounded-full p-2 text-muted hover:bg-ink/5 hover:text-ink">
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <nav className="absolute right-0 top-12 w-56 rounded-2xl bg-surface p-2 shadow-lg ring-1 ring-line">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="block rounded-xl px-4 py-3 text-sm font-semibold hover:bg-ink/5">
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
