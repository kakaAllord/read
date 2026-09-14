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

/* The rendered text, folded the way the extraction folded it, with every
   character remembering the text node it came from. A ligature is one
   character on the page and two in the stored quote, so the map is kept per
   character rather than per node. */
type Flat = { text: string; nodes: Text[]; offsets: number[] };

function flatten(root: HTMLElement): Flat {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  const nodes: Text[] = [];
  const offsets: number[] = [];
  let space = true; /* leading whitespace is not worth a position */

  const put = (ch: string, node: Text, at: number) => {
    text += ch;
    nodes.push(node);
    offsets.push(at);
  };

  let cur: Node | null;
  while ((cur = walker.nextNode())) {
    const node = cur as Text;
    const raw = node.data;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (/\s/.test(ch)) {
        /* A run of whitespace — including the line breaks pdf.js puts
           between spans — is one space, which is what the quote has. */
        if (!space) put(" ", node, i);
        space = true;
        continue;
      }
      space = false;
      const folded = LIGATURES[ch] ?? FOLDED[ch] ?? ch;
      for (const out of folded) put(out, node, i);
    }
  }
  return { text, nodes, offsets };
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

function rangesFor(flat: Flat, quote: string): Range[] {
  const out: Range[] = [];
  if (!quote) return out;
  let from = 0;
  for (;;) {
    const at = flat.text.indexOf(quote[0], from);
    if (at < 0) break;
    const end = matchAt(flat.text, quote, at);
    if (end > at) {
      const range = document.createRange();
      range.setStart(flat.nodes[at], flat.offsets[at]);
      const last = end - 1;
      const node = flat.nodes[last];
      range.setEnd(node, Math.min(node.data.length, flat.offsets[last] + 1));
      out.push(range);
      from = end;
    } else {
      from = at + 1;
    }
  }
  return out;
}

export type PaintItem = { quote: string; name: HighlightName };
export type HighlightName = "read-highlight" | "read-question";

const NAMES: HighlightName[] = ["read-highlight", "read-question"];

export function supported(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS;
}

/**
 * Repaint every stored passage currently on screen. Called after a render and
 * whenever the reader scrolls a new page in, because the pages are
 * virtualised and the text layer is rebuilt each time.
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
    const found = rangesFor(flat, item.quote);
    if (found.length === 0) continue;
    const list = byName.get(item.name);
    if (list) list.push(...found);
    else byName.set(item.name, found);
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
