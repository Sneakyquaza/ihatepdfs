import { notFound } from "next/navigation";

// Deeper unknown paths (/fr/x/y) would otherwise fall through to Next's untranslated default 404.
export default function Rest() {
  notFound();
}
