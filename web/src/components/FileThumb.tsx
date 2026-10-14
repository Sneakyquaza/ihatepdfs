"use client";

import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { extOf } from "@/lib/files";
import { openPdf, renderPage } from "@/lib/pdfjs";

/** Small preview: first page for PDFs, the image itself for images, an icon otherwise. */
export function FileThumb({ file, className = "" }: { file: File; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const isPdf = file.type === "application/pdf" || extOf(file.name) === "pdf";
  const isImage = file.type.startsWith("image/");

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    if (isImage) {
      url = URL.createObjectURL(file);
      setSrc(url);
    } else if (isPdf) {
      (async () => {
        try {
          const doc = await openPdf(file);
          const page = await doc.getPage(1);
          const scale = 240 / page.getViewport({ scale: 1 }).width;
          const canvas = await renderPage(doc, 1, scale);
          await doc.destroy();
          if (!cancelled) setSrc(canvas.toDataURL("image/jpeg", 0.8));
        } catch {
          /* encrypted or broken PDF: keep the icon */
        }
      })();
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, isImage, isPdf]);

  return (
    <div className={`grid place-items-center overflow-hidden bg-canvas ${isImage ? "checker" : ""} ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="max-h-full max-w-full object-contain shadow-sm" />
      ) : (
        <FileText className="h-10 w-10 text-muted/50" />
      )}
    </div>
  );
}
