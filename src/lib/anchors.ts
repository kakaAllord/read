import { normalizeText } from "./text/normalize";
import type { Anchor, BookText } from "./types";

export const CONTEXT = 30;

/* Every rendered block carries its character offset into the book's
   normalized text. That offset, not a page coordinate, is what an entry
   holds on to: it survives reflow, a font-size change and a window resize,
   none of which a coordinate does. */
export const OFFSET_ATTR = "data-offset";

function blockElement(node: Node | null): HTMLElement | null {
  let el = node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (el && !el.hasAttribute(OFFSET_ATTR)) el = el.parentElement;
  return el;
}

/** Characters between the start of `root` and (node, offset). */
function indexWithin(root: HTMLElement, node: Node, offset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = 0;
  let cur: Node | null;
  while ((cur = walker.nextNode())) {
    if (cur === node) return n + offset;
    n += cur.textContent?.length ?? 0;
  }
  return n;
}

/* A selection made over a drawn page comes straight off the glyph runs: it
   still has the ligatures, the smart quotes and the hyphens the extraction
   folded away, so it is put through the same normalization before it is
   looked for. A reflowed selection is already normalized and passes through
   this unchanged. */
function cleanSelection(raw: string): string {
  return normalizeText(raw.replace(/\s+/g, " ")).trim();
}

/* The extraction joins a word broken across two lines. In a selection that
   break survives as "trans- formation" — a real compound has no space after
   its hyphen, so the two cases stay apart. */
function dehyphenate(s: string): string {
  return s.replace(/([A-Za-z])-\s+([a-z])/g, "$1$2");
}

/**
 * Turn the live selection into a quote anchor. Returns null when the
 * selection is empty or falls outside the book pane.
 */
export function anchorFromSelection(
  bookId: string,
  text: BookText,
): { anchor: Anchor; exact: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const exact = cleanSelection(sel.toString());
  if (!exact) return null;

  const range = sel.getRangeAt(0);
  const el = blockElement(range.startContainer);
  if (!el) return null;

  const base = Number(el.getAttribute(OFFSET_ATTR));
  const within = indexWithin(el, range.startContainer, range.startOffset);
  const near = base + within;

  /* The DOM index is close but not exact — rendered text differs from the
     normalized text by collapsed whitespace, and over a drawn page the spans
     carry no offsets of their own at all. Snap to the nearest real
     occurrence, and keep whichever spelling of the quote was the one found,
     because that is what has to be findable again years from now. */
  let offset = -1;
  let quote = exact;
  for (const candidate of [exact, dehyphenate(exact)]) {
    const found = findNear(text.fullText, candidate, near);
    if (found >= 0) {
      offset = found;
      quote = candidate;
      break;
    }
  }

  /* Nothing matched: a scan with a crooked text layer, or an extraction that
     dropped what was selected. `near` is still the page the selection was
     made on, so the entry lands in the right place even when the quote itself
     cannot be re-found. */
  if (offset < 0) {
    return { exact, anchor: { kind: "location", bookId, offset: near } };
  }

  return {
    exact: quote,
    anchor: {
      kind: "quote",
      bookId,
      offset,
      exact: quote,
      prefix: text.fullText.slice(Math.max(0, offset - CONTEXT), offset),
      suffix: text.fullText.slice(offset + quote.length, offset + quote.length + CONTEXT),
    },
  };
}

/** The occurrence of `needle` closest to `near`, or -1. */
function findNear(hay: string, needle: string, near: number): number {
  const window = 4000;
  const from = Math.max(0, near - window);
  const local = hay.indexOf(needle, from);
  if (local >= 0 && local - near < window) return local;
  return hay.indexOf(needle);
}

/**
 * Re-find a stored anchor in the current extraction. The prefix/exact/suffix
 * triple is tried first; the bare quote second; the recorded offset last.
 * Re-extraction can shift, and an entry written years ago still has to land
 * somewhere sensible.
 */
export function resolveAnchor(anchor: Anchor, text: BookText): number | null {
  if (anchor.kind === "free") return null;
  if (anchor.kind === "location") return anchor.offset;

  const full = text.fullText;
  const triple = anchor.prefix + anchor.exact + anchor.suffix;
  const t = full.indexOf(triple);
  if (t >= 0) return t + anchor.prefix.length;

  const e = findNear(full, anchor.exact, anchor.offset);
  if (e >= 0) return e;

  return Math.min(anchor.offset, Math.max(0, full.length - 1));
}

/** The page containing a character offset. */
export function pageAt(text: BookText, offset: number): number {
  const pages = text.pages;
  let lo = 0;
  let hi = pages.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pages[mid].offset <= offset) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}
