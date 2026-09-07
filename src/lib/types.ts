export type ViewMode = "reflow" | "page";
export type BookFormat = "pdf" | "epub";

export type Book = {
  id: string;
  driveFileId: string;
  format: BookFormat;
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

export type Entry = {
  id: string;
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
  createdAt: string; // ISO UTC
  updatedAt: string;
};

/* A page of reconstructed text. One per source PDF page; for EPUB, one per
   slice of a spine item. `offset` is the character index of this page's first
   character in the book's normalized full text. */
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
