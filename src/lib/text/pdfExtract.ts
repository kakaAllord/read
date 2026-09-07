import type { PDFDocumentProxy } from "./pdf";
import { median, normalizeText } from "./normalize";
import type { Block, BookPage, BookText } from "../types";

/* pdf.js hands back positioned glyph runs with no paragraph, heading or
   reading-order structure. Everything below is the reconstruction described
   in the brief, done in two passes: gather lines and page geometry first,
   then decide breaks against the *book's* medians rather than the page's. */

type Line = {
  text: string;
  x: number; // left edge
  right: number; // right edge
  y: number; // baseline, page coordinates (origin bottom-left)
  height: number; // median glyph height on the line
};

type RawPage = {
  index: number;
  width: number;
  height: number;
  lines: Line[];
};

type TextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
};

async function readPage(pdf: PDFDocumentProxy, n: number): Promise<RawPage> {
  const page = await pdf.getPage(n);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = (content.items as unknown as TextItem[]).filter(
    (i) => typeof i.str === "string" && i.str.trim() !== "",
  );

  const heights = items.map((i) => Math.abs(i.transform[3]) || i.height).filter(Boolean);
  const medH = median(heights) || 10;

  /* Group into lines by baseline. Half a glyph height of slop absorbs the
     subscripts, superscripts and small caps that ride slightly off it. */
  const rows = new Map<number, TextItem[]>();
  const tol = Math.max(1.5, medH * 0.5);
  for (const it of items) {
    const y = it.transform[5];
    let key: number | null = null;
    for (const k of rows.keys()) {
      if (Math.abs(k - y) <= tol) {
        key = k;
        break;
      }
    }
    if (key === null) rows.set(y, [it]);
    else rows.get(key)!.push(it);
  }

  const lines: Line[] = [];
  for (const [y, group] of rows) {
    group.sort((a, b) => a.transform[4] - b.transform[4]);
    let text = "";
    let prevEnd: number | null = null;
    for (const it of group) {
      const x = it.transform[4];
      const gap = prevEnd === null ? 0 : x - prevEnd;
      /* pdf.js splits a word wherever kerning changes. A gap under a quarter
         of a glyph is inside a word, not between two. */
      if (prevEnd !== null && gap > medH * 0.22 && !/\s$/.test(text)) text += " ";
      text += it.str;
      prevEnd = x + (it.width || 0);
    }
    const cleaned = normalizeText(text);
    if (!cleaned) continue;
    const gh = median(group.map((i) => Math.abs(i.transform[3]) || i.height)) || medH;
    lines.push({
      text: cleaned,
      x: group[0].transform[4],
      right: prevEnd ?? group[0].transform[4],
      y,
      height: gh,
    });
  }

  lines.sort((a, b) => b.y - a.y); // top of the page down
  return { index: n, width: viewport.width, height: viewport.height, lines };
}

/* — running heads and folios —
   A line in the top or bottom 8% of the page that is a bare number, or whose
   text turns up on many pages, is furniture rather than prose. */
function furniture(pages: RawPage[]): Set<string> {
  const counts = new Map<string, number>();
  for (const p of pages) {
    const top = p.height * 0.92;
    const bottom = p.height * 0.08;
    for (const l of p.lines) {
      if (l.y < top && l.y > bottom) continue;
      const key = l.text.replace(/\d+/g, "#").toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const threshold = Math.max(3, Math.floor(pages.length * 0.25));
  const out = new Set<string>();
  for (const [key, n] of counts) if (n >= threshold) out.add(key);
  return out;
}

function isFurniture(l: Line, p: RawPage, repeated: Set<string>): boolean {
  const top = p.height * 0.92;
  const bottom = p.height * 0.08;
  if (l.y < top && l.y > bottom) return false;
  if (/^[ivxlcdm]{1,7}$/i.test(l.text)) return true; // roman folio
  if (/^\W*\d{1,4}\W*$/.test(l.text)) return true; // bare number
  return repeated.has(l.text.replace(/\d+/g, "#").toLowerCase());
}

export type PdfExtractOptions = {
  onProgress?: (done: number, total: number) => void;
};

export async function extractPdf(
  pdf: PDFDocumentProxy,
  bookId: string,
  opts: PdfExtractOptions = {},
): Promise<BookText> {
  const total = pdf.numPages;
  const raw: RawPage[] = [];
  for (let n = 1; n <= total; n++) {
    raw.push(await readPage(pdf, n));
    opts.onProgress?.(n, total);
  }

  const repeated = furniture(raw);

  /* Book-wide medians. A page of dialogue has a different gap profile from a
     page of exposition; the book as a whole does not. */
  const bodyLines: Line[] = [];
  for (const p of raw) {
    for (const l of p.lines) if (!isFurniture(l, p, repeated)) bodyLines.push(l);
  }
  const medHeight = median(bodyLines.map((l) => l.height)) || 10;
  const medLeft = median(bodyLines.map((l) => l.x));
  const medRight = median(bodyLines.map((l) => l.right));

  const gaps: number[] = [];
  for (const p of raw) {
    const ls = p.lines.filter((l) => !isFurniture(l, p, repeated));
    for (let i = 1; i < ls.length; i++) gaps.push(ls[i - 1].y - ls[i].y);
  }
  const medGap = median(gaps.filter((g) => g > 0)) || medHeight * 1.2;

  const runningFor = new Map<number, string>();
  for (const p of raw) {
    const head = p.lines.find(
      (l) => l.y >= p.height * 0.92 && !/^\W*\d{1,4}\W*$/.test(l.text),
    );
    if (head) runningFor.set(p.index, head.text);
  }

  const pages: BookPage[] = [];
  const parts: string[] = [];
  let cursor = 0;
  const chapters: string[] = [];

  for (const p of raw) {
    const pageOffset = cursor;
    const ls = p.lines.filter((l) => !isFurniture(l, p, repeated));
    const blocks: Block[] = [];

    let buf = "";
    let bufKind: Block["kind"] = "para";
    let bufIndent = false;
    let prev: Line | null = null;

    const flush = () => {
      const text = normalizeText(buf);
      if (!text) {
        buf = "";
        return;
      }
      blocks.push({ kind: bufKind, text, offset: cursor, indent: bufIndent });
      parts.push(text);
      cursor += text.length + 2; // the "\n\n" the joined text carries
      buf = "";
    };

    for (const l of ls) {
      const heading = l.height > medHeight * 1.2;
      let breakHere = buf === "";

      if (!breakHere && prev) {
        const gap = prev.y - l.y;
        const indented = l.x > medLeft + medHeight * 0.6;
        const shortPrev = prev.right < medRight - medHeight * 2.2;
        const kindChanged = heading !== (bufKind === "heading");
        if (gap > medGap * 1.4 || indented || shortPrev || kindChanged) breakHere = true;
      }

      if (breakHere && buf) flush();
      if (!buf) {
        bufKind = heading ? "heading" : "para";
        bufIndent = l.x > medLeft + medHeight * 0.6;
      }

      if (buf) {
        /* De-hyphenate: a line ending in "-" before a lowercase start is one
           word split across two lines, not a compound. */
        if (/[A-Za-z]-$/.test(buf) && /^[a-z]/.test(l.text)) buf = buf.slice(0, -1) + l.text;
        else buf += " " + l.text;
      } else {
        buf = l.text;
      }
      prev = l;
    }
    flush();

    for (const b of blocks) {
      if (b.kind === "heading" && !chapters.includes(b.text) && b.text.length < 80) {
        chapters.push(b.text);
      }
    }

    pages.push({
      index: p.index - 1,
      number: p.index,
      running: runningFor.get(p.index) ?? "",
      offset: pageOffset,
      blocks,
    });
  }

  return { bookId, pages, fullText: parts.join("\n\n"), chapters };
}
