import type { PDFDocumentProxy } from "./pdf";
import type { ViewMode } from "../types";

/* The view mode is decided at import from what the file actually contains,
   not from what it claims to be. A scan has no text layer and cannot reflow;
   a two-column journal article extracts in the wrong reading order and would
   reflow into nonsense. Both go to page mode, and the user is told. */

export type ModeVerdict = {
  mode: ViewMode;
  reason: string;
  avgChars: number;
  textPages: number;
  sampled: number;
  columns: number;
};

type Item = { str: string; transform: number[] };

function sampleIndexes(total: number, want: number): number[] {
  if (total <= want) return Array.from({ length: total }, (_, i) => i + 1);
  const step = total / want;
  const out: number[] = [];
  for (let i = 0; i < want; i++) out.push(Math.max(1, Math.round(1 + i * step)));
  return [...new Set(out)];
}

/** Two clusters of line-start x, each holding real mass, means two columns. */
function countColumns(starts: number[], width: number): number {
  if (starts.length < 20) return 1;
  const bins = new Array(20).fill(0);
  for (const x of starts) {
    const b = Math.min(19, Math.max(0, Math.floor((x / width) * 20)));
    bins[b]++;
  }
  const floor = starts.length * 0.12;
  let peaks = 0;
  let inPeak = false;
  for (let i = 0; i < bins.length; i++) {
    const hot = bins[i] >= floor;
    if (hot && !inPeak) peaks++;
    inPeak = hot;
  }
  return Math.max(1, peaks);
}

export async function detectMode(pdf: PDFDocumentProxy): Promise<ModeVerdict> {
  const idx = sampleIndexes(pdf.numPages, 12);
  let chars = 0;
  let withText = 0;
  const starts: number[] = [];
  let width = 612;

  for (const n of idx) {
    const page = await pdf.getPage(n);
    width = page.getViewport({ scale: 1 }).width;
    const content = await page.getTextContent();
    const items = content.items as unknown as Item[];
    const text = items.map((i) => i.str).join("");
    chars += text.trim().length;
    if (text.trim().length > 80) withText++;

    /* One x per line, so a long line does not outvote a short one. */
    const seen = new Set<number>();
    for (const it of items) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      if (seen.has(y)) continue;
      seen.add(y);
      starts.push(it.transform[4]);
    }
  }

  const sampled = idx.length;
  const avgChars = Math.round(chars / sampled);
  const columns = countColumns(starts, width);

  if (withText / sampled < 0.5 || avgChars < 200) {
    return {
      mode: "page",
      reason:
        "This looks like a scan — there is little or no text layer to reflow, so the pages are shown as they were printed.",
      avgChars,
      textPages: withText,
      sampled,
      columns,
    };
  }
  if (columns > 1) {
    return {
      mode: "page",
      reason:
        "The text runs in more than one column, which extracts in the wrong reading order, so the pages are shown as they were printed.",
      avgChars,
      textPages: withText,
      sampled,
      columns,
    };
  }
  return {
    mode: "reflow",
    reason: "The text extracted cleanly, so it is re-set in the app's own typography.",
    avgChars,
    textPages: withText,
    sampled,
    columns,
  };
}
