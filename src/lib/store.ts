import { db, setMeta } from "./db";
import { newId } from "./ids";
import { countWords } from "./words";
import { parseRef } from "./bibleRefs";
import { pageAt, resolveAnchor } from "./anchors";
import { openPdf } from "./text/pdf";
import { extractPdf } from "./text/pdfExtract";
import { detectMode, type ModeVerdict } from "./text/modeDetect";
import { coverFromPdf } from "./text/cover";
import { cacheBook, cachedBook } from "./cache";
import { pathOf } from "./github/paths";
import { fetchBook, markBookChanged, markLibraryChanged, noteEntrySaved, pushNewBook } from "./sync";
import { connected } from "./github/config";
import type { Anchor, Book, BookText, Entry, EntryKind, QuestionStatus } from "./types";

export type Probe = {
  bytes: ArrayBuffer;
  fileName: string;
  title: string;
  author?: string;
  pageCount: number;
  coverDataUrl?: string;
  text: BookText;
  verdict: ModeVerdict;
};

function titleFromFileName(name: string): string {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/-+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isPdf(name: string, mime?: string): boolean {
  return /\.pdf$/i.test(name) || mime === "application/pdf";
}

/**
 * Read the file well enough to fill the dialog in: title, author, cover, page
 * count, and which of the two view modes it belongs in. Nothing is written
 * and nothing is uploaded until the user confirms.
 */
export async function probeFile(
  file: Blob,
  fileName: string,
  onProgress?: (fraction: number, label: string) => void,
): Promise<Probe> {
  if (!isPdf(fileName, file.type)) throw new Error("That is not a PDF.");
  const bytes = await file.arrayBuffer();
  const bookId = newId("b");

  onProgress?.(0.05, "Opening the file");
  const pdf = await openPdf(bytes);
  const verdict = await detectMode(pdf);
  onProgress?.(0.2, "Rendering the cover");
  const coverDataUrl = await coverFromPdf(pdf);

  const info = (await pdf.getMetadata().catch(() => null)) as {
    info?: { Title?: string; Author?: string };
  } | null;
  const metaTitle = info?.info?.Title?.trim();
  const metaAuthor = info?.info?.Author?.trim();

  const text = await extractPdf(pdf, bookId, {
    onProgress: (done, total) => onProgress?.(0.2 + 0.8 * (done / total), "Extracting text"),
  });

  return {
    bytes,
    fileName,
    title: metaTitle && metaTitle.length > 1 ? metaTitle : titleFromFileName(fileName),
    author: metaAuthor && metaAuthor.length > 1 ? metaAuthor : undefined,
    pageCount: pdf.numPages,
    coverDataUrl,
    text,
    verdict,
  };
}

export type BookFields = { title: string; author: string; genre: string };

export async function commitBook(
  probe: Probe,
  fields: BookFields,
  onProgress?: (fraction: number) => void,
): Promise<Book> {
  const title = fields.title.trim() || probe.title;
  const genre = (fields.genre.trim() || "unfiled").toLowerCase();

  const key = `local:${probe.text.bookId}`;
  await cacheBook(key, probe.bytes);

  const book: Book = {
    id: probe.text.bookId,
    fileKey: key,
    viewMode: probe.verdict.mode,
    title,
    author: fields.author.trim() || probe.author,
    genre,
    coverDataUrl: probe.coverDataUrl,
    pageCount: probe.pageCount,
    lastLocation: 0,
    addedAt: new Date().toISOString(),
  };

  await db.books.put(book);
  await db.texts.put(probe.text);

  /* The file goes up now, under the genre it was just given. Only the notes
     written about it later wait for Save. */
  if (connected()) {
    try {
      book.fileKey = await pushNewBook(book, probe.bytes, onProgress);
      return book;
    } catch {
      /* Offline, a lapsed token, or a file over the ceiling. The book is
         already in this browser and readable; it joins the queue instead, and
         the count in the header is what says so. */
    }
  }

  onProgress?.(1);
  markBookChanged(book.id);
  markLibraryChanged();
  return book;
}

/** The extraction, from the local cache if it is there and the repo if not. */
export async function loadBookText(book: Book): Promise<BookText> {
  const stored = await db.texts.get(book.id);
  if (stored) return stored;

  const bytes = await loadBookBytes(book);
  const pdf = await openPdf(bytes);
  const text = await extractPdf(pdf, book.id);
  await db.texts.put(text);
  return text;
}

export async function loadBookBytes(book: Book): Promise<ArrayBuffer> {
  const hit = await cachedBook(book.fileKey);
  if (hit) return hit;
  const path = pathOf(book.fileKey);
  if (!path) {
    throw new Error(
      "The file for this book is not on this device, and it was never saved to the repo.",
    );
  }
  const bytes = await fetchBook(path);
  await cacheBook(book.fileKey, bytes);
  return bytes;
}

/* — entries — */

export type Draft = {
  bookId?: string;
  kind: EntryKind;
  title: string;
  body: string;
  anchor: Anchor;
  excerpt?: string;
  displayLocation?: string;
  source: Entry["source"];
};

export async function saveEntry(draft: Draft): Promise<Entry> {
  const now = new Date().toISOString();
  const entry: Entry = {
    id: newId("e"),
    kind: draft.kind,
    bookId: draft.bookId,
    title: draft.title.trim() || undefined,
    ref: parseRef(draft.title),
    body: draft.body.trim(),
    anchor: draft.anchor,
    excerpt: draft.excerpt,
    displayLocation: draft.displayLocation,
    wordCount: countWords(draft.body),
    source: draft.source,
    tags: [],
    /* A question is the only kind with anywhere left to go. */
    status: draft.kind === "question" ? "open" : undefined,
    createdAt: now,
    updatedAt: now,
  };
  await db.entries.put(entry);
  noteEntrySaved(entry);
  return entry;
}

/**
 * A highlight is the passage and nothing else — no title, no body, no cursor
 * taken away from the page. It is the cheapest thing you can do to a sentence
 * that you want to be able to find again.
 */
export async function saveHighlight(
  bookId: string,
  anchor: Anchor,
  excerpt: string,
  displayLocation: string,
): Promise<Entry> {
  const now = new Date().toISOString();
  const entry: Entry = {
    id: newId("h"),
    kind: "highlight",
    bookId,
    body: "",
    anchor,
    excerpt,
    displayLocation,
    wordCount: 0,
    source: "typed",
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.entries.put(entry);
  noteEntrySaved(entry);
  return entry;
}

/** Pressing H on a passage already highlighted takes the highlight off. */
export async function unhighlight(id: string): Promise<void> {
  const entry = await db.entries.get(id);
  if (!entry) return;
  await db.entries.delete(id);
  noteEntrySaved(entry);
}

export async function setQuestionStatus(id: string, status: QuestionStatus): Promise<void> {
  const entry = await db.entries.get(id);
  if (!entry) return;
  await db.entries.update(id, {
    status,
    answeredAt: status === "answered" ? new Date().toISOString() : undefined,
    updatedAt: new Date().toISOString(),
  });
  noteEntrySaved({ ...entry, status });
}

export type Progress = { page: number; pageCount: number };

/* Where a book has been read up to, kept small and separate so the dashboard
   can show three progress bars without loading three books' worth of text. */
export function progressKey(bookId: string): string {
  return `progress.${bookId}`;
}

export async function rememberLocation(
  bookId: string,
  offset: number,
  progress?: Progress,
): Promise<void> {
  const book = await db.books.get(bookId);
  if (!book) return;
  await db.books.update(bookId, {
    lastLocation: offset,
    lastOpenedAt: new Date().toISOString(),
  });
  if (progress) await setMeta(progressKey(bookId), progress);
  markLibraryChanged();
}

export async function recordSession(bookId: string, minutes: number): Promise<void> {
  await db.sessions.put({
    id: newId("s"),
    bookId,
    startedAt: new Date().toISOString(),
    minutes,
  });
}

export async function setViewMode(bookId: string, viewMode: Book["viewMode"]): Promise<void> {
  await db.books.update(bookId, { viewMode });
  markLibraryChanged();
}

/** "Psalms 22 · p. 612" — written once, at save time, and never recomputed. */
export function labelFor(text: BookText, offset: number): string {
  const page = text.pages[pageAt(text, offset)];
  if (!page) return "";
  const running = page.running?.trim();
  return running ? `${running} · p. ${page.number}` : `p. ${page.number}`;
}

export function entryPage(entry: Entry, text: BookText): number | null {
  const offset = resolveAnchor(entry.anchor, text);
  return offset === null ? null : pageAt(text, offset);
}

export async function markSeen(): Promise<void> {
  await setMeta("lastSeenAt", new Date().toISOString());
}
