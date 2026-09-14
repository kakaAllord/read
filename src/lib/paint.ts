import { OFFSET_ATTR } from "./anchors";

/* Painting a stored passage back onto the page.
 *
 * The obvious way is to wrap the words in <mark> elements, and it is the
 * wrong way here. Page mode's text is a pdf.js text layer, which is rebuilt
 * from scratch every time a page renders — anything wrapped around it is
 * destroyed on the next scroll. Wrapping also has to split text nodes, which
 * changes the DOM the anchoring code reads back.
 *
 * The CSS Custom Highlight API paints ranges without touching the DOM at
 * all: Range objects go into `CSS.highlights` under a name, and a
 * `::highlight(name)` rule says what they look like. Nothing is wrapped,
 * nothing is split, and a text layer rebuild costs only a recompute. It has
 * been in every engine since Firefox 140 in mid-2025.
 *
 * What is stored is the quote, not a coordinate, so finding it again is a
 * search through the rendered text — the same thing Hypothesis does, and for
 * the same reason: the document the quote came from is not guaranteed to be
 * laid out the way it was when the quote was taken.
 *
 * But a quote is not unique. "the same thing" occurs on a hundred pages, and
 * painting every occurrence of it puts a highlight everywhere the phrase
 * appears rather than on the sentence that was marked. So the search is
 * disambiguated by where the passage came from: every rendered character
 * carries an estimate of its offset into the book, taken from the nearest
 * enclosing element that knows its own, and the occurrence nearest the stored
 * offset is the one painted. One mark per thing marked, in the place it was
 * made.
 */

const LIGATURES: Record<string, string> = {
  "ﬀ": "ff",
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
  "ﬅ": "st",
  "ﬆ": "st",
};

const FOLDED: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‛": "'",
  "“": '"',
  "”": '"',
  "‟": '"',
  "‐": "-",
  "‑": "-",
  "−": "-",
  " ": " ",
  "­": "",
};

/* How far the occurrence found may sit from where the passage was taken
   before it is treated as a different passage that happens to read the same.
   A page is a couple of thousand characters, so a correct match is out by at
   most the running heads and folios the extraction stripped; anything a page
   away is a different sentence. */
const MAX_DRIFT = 4000;

/* The rendered text, folded the way the extraction folded it. Every character
   remembers the text node it came from — a ligature is one character on the
   page and two in the stored quote, so the map is kept per character rather
   than per node — and what its offset into the book is thought to be. */
type Flat = { text: string; nodes: Text[]; offsets: number[]; at: number[] };

/** The nearest enclosing element that knows its own offset into the book. */
function ownerOf(node: Node, root: HTMLElement): HTMLElement | null {
  let el = node.parentElement;
  while (el) {
    if (el.hasAttribute(OFFSET_ATTR)) return el;
    if (el === root) return null;
    el = el.parentElement;
  }
  return null;
}

function flatten(root: HTMLElement): Flat {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  const nodes: Text[] = [];
  const offsets: number[] = [];
  const at: number[] = [];
  let space = true; /* leading whitespace is not worth a position */

  let holder: HTMLElement | null = null;
  let base = 0;
  let started = 0;

  const put = (ch: string, node: Text, index: number) => {
    at.push(base + (text.length - started));
    text += ch;
    nodes.push(node);
    offsets.push(index);
  };

  let cur: Node | null;
  while ((cur = walker.nextNode())) {
    const node = cur as Text;

    const owner = ownerOf(node, root);

    /* Page furniture — the running head and the folio printed on the card —
       belongs to no block and is not part of the book's text. Leaving it in
       would let a quote match against a chapter title. */
    if (!owner) continue;

    if (owner !== holder) {
      /* A new paragraph, or a new page. Two blocks that merely abut in the
         DOM are not one run of prose, and without a break between them a
         quote could match across the seam and mark words from both. */
      if (text && !space) {
        put(" ", node, 0);
        space = true;
      }
      holder = owner;
      base = Number(owner.getAttribute(OFFSET_ATTR));
      started = text.length;
    }

    const raw = node.data;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (/\s/.test(ch)) {
        /* A run of whitespace — including the line breaks pdf.js puts between
           its spans — is one space, which is what the quote has. */
        if (!space) put(" ", node, i);
        space = true;
        continue;
      }
      space = false;
      const folded = LIGATURES[ch] ?? FOLDED[ch] ?? ch;
      for (const out of folded) put(out, node, i);
    }
  }
  return { text, nodes, offsets, at };
}

/**
 * Match `quote` in `flat` starting at `from`, returning the index just past
 * the match or -1.
 *
 * The one licence taken is the hyphen the extraction removed when it joined a
 * word broken across two lines: on the page that is still "trans- formation"
 * and in the quote it is "transformation". A hyphen is skipped only with that
 * exact shape around it — letter before, space after, lowercase resuming — so
 * a real compound is never quietly eaten.
 */
function matchAt(flat: string, quote: string, from: number): number {
  let i = from;
  let j = 0;
  while (j < quote.length) {
    if (i >= flat.length) return -1;
    if (flat[i] === quote[j]) {
      i++;
      j++;
      continue;
    }
    if (
      flat[i] === "-" &&
      flat[i + 1] === " " &&
      /[A-Za-z]/.test(flat[i - 1] ?? "") &&
      /[a-z]/.test(quote[j])
    ) {
      i += 2;
      continue;
    }
    return -1;
  }
  return i;
}

/** The one occurrence of `quote` that is where `offset` says it should be. */
function rangeFor(flat: Flat, quote: string, offset: number): Range | null {
  if (!quote) return null;

  let bestAt = -1;
  let bestEnd = -1;
  let bestDrift = Infinity;

  let from = 0;
  for (;;) {
    const found = flat.text.indexOf(quote[0], from);
    if (found < 0) break;
    const end = matchAt(flat.text, quote, found);
    if (end > found) {
      const drift = Math.abs(flat.at[found] - offset);
      if (drift < bestDrift) {
        bestDrift = drift;
        bestAt = found;
        bestEnd = end;
      }
      from = end;
    } else {
      from = found + 1;
    }
  }

  /* Every occurrence on screen is somewhere else in the book: the page this
     passage belongs to is not rendered, and marking the nearest lookalike
     would be worse than marking nothing. */
  if (bestAt < 0 || bestDrift > MAX_DRIFT) return null;

  const range = document.createRange();
  range.setStart(flat.nodes[bestAt], flat.offsets[bestAt]);
  const last = bestEnd - 1;
  const node = flat.nodes[last];
  range.setEnd(node, Math.min(node.data.length, flat.offsets[last] + 1));
  return range;
}

export type HighlightName = "read-highlight" | "read-question";
export type PaintItem = { quote: string; offset: number; name: HighlightName };

const NAMES: HighlightName[] = ["read-highlight", "read-question"];

export function supported(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS;
}

/**
 * Repaint every stored passage currently on screen. Called after a render and
 * whenever the reader scrolls a new page in, because the pages are virtualised
 * and the text layer is rebuilt each time.
 */
export function paint(root: HTMLElement | null, items: PaintItem[]): void {
  if (!supported()) return;
  if (!root || items.length === 0) {
    clear();
    return;
  }

  const flat = flatten(root);
  const byName = new Map<HighlightName, Range[]>();
  for (const item of items) {
    const range = rangeFor(flat, item.quote, item.offset);
    if (!range) continue;
    const list = byName.get(item.name);
    if (list) list.push(range);
    else byName.set(item.name, [range]);
  }

  for (const name of NAMES) {
    const ranges = byName.get(name);
    if (ranges && ranges.length > 0) CSS.highlights.set(name, new Highlight(...ranges));
    else CSS.highlights.delete(name);
  }
}

export function clear(): void {
  if (!supported()) return;
  for (const name of NAMES) CSS.highlights.delete(name);
}
