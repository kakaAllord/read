import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "../lib/text/pdf";

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;
const WIDTH = 640;

/* Page mode: the file drawn as it was printed, in the same card the reflow
   mode uses, so a book that cannot reflow still sits in the same room. */

type Props = {
  pdf: PDFDocumentProxy | null;
  pageNumber: number;
  running: string;
};

export default function PdfPageCard({ pdf, pageNumber, running }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(1.4);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;

    void (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale: (WIDTH / base.width) * dpr });
      const el = canvas.current;
      if (!el) return;
      el.width = Math.round(viewport.width);
      el.height = Math.round(viewport.height);
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const render = page.render({ canvasContext: ctx, viewport });
      task = render;
      try {
        await render.promise;
      } catch {
        /* superseded by a newer render, or the page scrolled away */
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber]);

  return (
    <div
      style={{
        width: "min(640px, calc(100% - 48px))",
        margin: "0 auto 34px",
        background: "var(--color-page)",
        border: "1px solid var(--color-divider)",
        boxShadow: "var(--shadow-sm)",
        padding: "22px 22px 18px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: muted(40),
          marginBottom: 14,
        }}
      >
        <div>{running}</div>
        <div style={{ fontVariantNumeric: "tabular-nums" }}>{pageNumber}</div>
      </div>
      <canvas ref={canvas} className="page-canvas" style={{ aspectRatio: `1 / ${ratio}` }} />
    </div>
  );
}
