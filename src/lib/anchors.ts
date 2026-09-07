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

  const raw = sel.toString();
  const exact = raw.replace(/\s+/g, " ").trim();
  if (!exact) return null;

  const range = sel.getRangeAt(0);
  const el = blockElement(range.startContainer);
  if (!el) return null;

  const base = Number(el.getAttribute(OFFSET_ATTR));
  const within = indexWithin(el, range.startContainer, range.startOffset);
  let offset = base + within;

  /* The DOM index is close but not exact — the block's rendered text can
     differ from the normalized text by collapsed whitespace. Snap to the
     nearest real occurrence. */
  const found = findNear(text.fullText, exact, offset);
  if (found >= 0) offset = found;

  return {
    exact,
    anchor: {
      kind: "quote",
      bookId,
      offset,
      exact,
      prefix: text.fullText.slice(Math.max(0, offset - CONTEXT), offset),
      suffix: text.fullText.slice(offset + exact.length, offset + exact.length + CONTEXT),
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
