export type ViewMode = "reflow" | "page";

export type Book = {
  id: string;
  fileKey: string; // "gh:books/faith/mere-christianity.pdf", or "local:<id>"
  viewMode: ViewMode;
  title: string;
  author?: string;
  genre: string;
  coverDataUrl?: string;
  pageCount?: number;
  lastLocation: number; // character offset, not page number
  addedAt: string; // ISO UTC
  lastOpenedAt?: string;
};

export type Anchor =
  | {
      kind: "quote";
      bookId: string;
      offset: number;
      exact: string;
      prefix: string;
      suffix: string;
    }
  | { kind: "location"; bookId: string; offset: number }
  | { kind: "free" };

/* Three things get written against a passage, and they are the same record
   with different intent:

     note       something thought while reading
     bookmark   the passage itself, kept without a word said about it
     highlight  the passage in a colour that means something to you
     question   something to go and find out, which stays open until it is not

   One type, because anchoring, syncing, the markdown in the repo and the
   re-finding of a passage years later are identical for all three, and a
   second table would be the same code written twice. */
export type EntryKind = "note" | "bookmark" | "highlight" | "question";

/* Five, which is where Apple Books landed and one more than Kindle, whose
   four are the most common complaint made about it. Stored as an index
   rather than a colour so that what the colour looks like stays a matter of
   the theme, and what it means stays a matter of the legend. */
export type HighlightColor = 1 | 2 | 3 | 4 | 5;
export const COLORS: HighlightColor[] = [1, 2, 3, 4, 5];

/* A mark is a passage kept, not a thing written. It costs one keystroke and
   no words, so it counts towards no streak and appears in no list of what
   was written — letting it would make both worth nothing. */
export function isMark(kind: EntryKind): boolean {
  return kind === "bookmark" || kind === "highlight";
}

/* What the reader has decided each colour means. A colour system is worth
   having only if it is used consistently, and it is only used consistently
   if what it means is written down somewhere other than in your head — which
   is the thing every guide to colour-coding says and no reading app does. */
export type Legend = Partial<Record<HighlightColor, string>>;

export const COLOR_NAMES: Record<HighlightColor, string> = {
  1: "Yellow",
  2: "Green",
  3: "Blue",
  4: "Pink",
  5: "Purple",
};

/** Questions, and only questions, are open until they are answered. */
export type QuestionStatus = "open" | "answered";

export type Entry = {
  id: string;
  kind: EntryKind;
  bookId?: string;
  title?: string;
  ref?: string;
  body: string;
  anchor: Anchor;
  excerpt?: string;
  displayLocation?: string;
  wordCount: number;
  source: "typed" | "spoken" | "mixed";
  tags: string[];
  color?: HighlightColor;
  status?: QuestionStatus;
  answeredAt?: string;
  createdAt: string; // ISO UTC
  updatedAt: string;
};

/* A page of reconstructed text, one per source PDF page. `offset` is the
   character index of this page's first character in the book's normalized
   full text. */
export type BookPage = {
  index: number;
  number: number | string; // the label printed in the running head
  running: string;
  offset: number;
  blocks: Block[];
};

export type Block = {
  kind: "heading" | "para";
  text: string;
  offset: number;
  indent: boolean;
};

export type BookText = {
  bookId: string;
  pages: BookPage[];
  fullText: string;
  chapters: string[]; // running-head names, in order, deduped
};

/* A focus session, counted on the dashboard. */
export type Session = {
  id: string;
  bookId: string;
  startedAt: string;
  minutes: number;
};
