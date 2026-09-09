import { db, setMeta } from "./db";
import { newId } from "./ids";
import { countWords } from "./words";
import { parseRef } from "./bibleRefs";
import { pageAt, resolveAnchor } from "./anchors";
import { openPdf } from "./text/pdf";
import { extractPdf } from "./text/pdfExtract";
import { extractEpub } from "./text/epubExtract";
import { detectMode, type ModeVerdict } from "./text/modeDetect";
import { coverFromPdf } from "./text/cover";
import { cacheBook, cachedBook } from "./cache";
import { pathOf } from "./github/paths";
import { fetchBook, markBookChanged, markLibraryChanged, noteEntrySaved } from "./sync";
import type { Anchor, Book, BookFormat, BookText, Entry } from "./types";

export type Probe = {
  bytes: ArrayBuffer;
  fileName: string;
  format: BookFormat;
  title: string;
  author?: string;
  pageCount: number;
  coverDataUrl?: string;
  text: BookText;
  verdict: ModeVerdict;
};

function titleFromFileName(name: string): string {
  return name
    .replace(/\.(pdf|epub)$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/-+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatOf(name: string, mime?: string): BookFormat | null {
  if (/\.epub$/i.test(name) || mime === "application/epub+zip") return "epub";
  if (/\.pdf$/i.test(name) || mime === "application/pdf") return "pdf";
  return null;
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
  const format = formatOf(fileName, file.type);
  if (!format) throw new Error("That is not a PDF or an EPUB.");
  const bytes = await file.arrayBuffer();
  const bookId = newId("b");

  if (format === "epub") {
    onProgress?.(0.3, "Reading the spine");
    const { text, meta } = await extractEpub(bytes, bookId);
    onProgress?.(1, "Ready");
    return {
      bytes,
      fileName,
      format,
      title: meta.title || titleFromFileName(fileName),
      author: meta.author,
      pageCount: text.pages.length,
      coverDataUrl: meta.coverDataUrl,
      text,
      verdict: {
        mode: "reflow",
        reason:
          "EPUB carries its own paragraphs, headings and chapters, so the text is re-set in the app typography.",
        avgChars: 0,
        textPages: text.pages.length,
        sampled: text.pages.length,
        columns: 1,
      },
    };
  }

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
    format,
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

  /* Nothing is uploaded here. The book is kept in this browser and marked as
     waiting; pressing Save is what puts it in the repo, under the genre it
     was given. */
  const key = `local:${probe.text.bookId}`;
  await cacheBook(key, probe.bytes);
  onProgress?.(1);

  const book: Book = {
    id: probe.text.bookId,
    fileKey: key,
    format: probe.format,
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
  markBookChanged(book.id);
  markLibraryChanged();
  return book;
}

/** The extraction, from the local cache if it is there and the repo if not. */
export async function loadBookText(book: Book): Promise<BookText> {
  const stored = await db.texts.get(book.id);
  if (stored) return stored;

  const bytes = await loadBookBytes(book);
  let text: BookText;
  if (book.format === "epub") {
    text = (await extractEpub(bytes, book.id)).text;
  } else {
    const pdf = await openPdf(bytes);
    text = await extractPdf(pdf, book.id);
  }
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
    createdAt: now,
    updatedAt: now,
  };
  await db.entries.put(entry);
  noteEntrySaved(entry);
  return entry;
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
