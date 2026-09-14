import { useEffect, useRef, useState } from "react";
import { OFFSET_ATTR } from "../lib/anchors";
import { TextLayer, type PDFDocumentProxy } from "../lib/text/pdf";

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;
const WIDTH = 640;

/* Page mode: the file drawn as it was printed, in the same card the reflow
   mode uses, so a book that cannot reflow still sits in the same room.

   The canvas is pixels, and pixels cannot be selected. So the same thing
   Adobe's viewer and Firefox's do is done here: pdf.js is asked for the
   glyph runs a second time and lays them out as transparent, positioned
   spans on top of the drawing. The words you drag across are real DOM text
   sitting exactly over the ink. Nothing is converted — the file stays a PDF
   and the canvas underneath is what you see. */

type Props = {
  pdf: PDFDocumentProxy | null;
  pageNumber: number;
  running: string;
  /* Where this page starts in the book's normalized text, so a selection
     made here resolves to an offset the way a reflowed one does. */
  offset: number;
};

export default function PdfPageCard({ pdf, pageNumber, running, offset }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(1.4);
  const [baseWidth, setBaseWidth] = useState(0);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    let layer: TextLayer | null = null;

    void (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      setBaseWidth(base.width);

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
        return; /* superseded by a newer render, or the page scrolled away */
      }
      if (cancelled) return;

      /* Laid out at scale 1 and sized by --scale-factor, so the spans follow
         the card through a resize without being rebuilt. */
      const container = layerRef.current;
      if (!container) return;
      container.replaceChildren();
      layer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport: page.getViewport({ scale: 1 }),
      });
      try {
        await layer.render();
      } catch {
        /* a scan with no text layer, or the page scrolled away */
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
      layer?.cancel();
    };
  }, [pdf, pageNumber]);

  /* The card is fluid, so the ratio of drawn width to the page's own width is
     not known until it is laid out, and changes when the pane is dragged. */
  useEffect(() => {
    const el = frame.current;
    if (!el || !baseWidth) return;
    const sync = () => {
      const w = el.clientWidth;
      if (w) el.style.setProperty("--scale-factor", String(w / baseWidth));
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseWidth]);

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
      <div ref={frame} style={{ position: "relative", aspectRatio: `1 / ${ratio}` }}>
        <canvas ref={canvas} className="page-canvas" style={{ display: "block", width: "100%" }} />
        <div ref={layerRef} className="textLayer" {...{ [OFFSET_ATTR]: offset }} />
      </div>
    </div>
  );
}
