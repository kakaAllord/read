import { db } from "./db";
import { cacheBook, cachedBook, dropBook } from "./cache";
import { monthKey } from "./dates";
import type { Book, BookFormat, Entry } from "./types";
import { exists, getBytes, list, putBinary, readText, writeText } from "./github/api";
import { connected } from "./github/config";
import {
  bookPath,
  genreDir,
  keyFor,
  LIBRARY,
  monthPath,
  notesPathForKey,
  JOURNAL,
} from "./github/paths";
import { renderEntries, parseEntries } from "./journalFile";

/*  library.json          book catalog
    books/
      faith/
        mere-christianity/
          mere-christianity.pdf
          notes.md        everything written about that book
    journal/
      2026-09.md          entries not tied to a book, and anything an older
                          version of this app wrote

    IndexedDB is what the interface reads. The repo is what survives it, and
    what makes the same journal appear in a browser that has never seen it.
    An entry is committed the moment it is saved; the catalog, which changes
    every time a page scrolls past, is debounced. */

const DEBOUNCE = 2500;

/* GitHub blocks a push over 100MB and warns over 50. The Contents API also
   carries the file as base64 in one JSON body, which is a third larger
   again, so the ceiling here is lower than the one GitHub advertises. */
export const MAX_BOOK_BYTES = 45 * 1024 * 1024;

export type SyncState = "off" | "idle" | "syncing" | "error";

let state: SyncState = connected() ? "idle" : "off";
let lastError: string | null = null;
const listeners = new Set<(s: SyncState, e: string | null) => void>();

function setState(s: SyncState, err: string | null = null) {
  state = s;
  lastError = err;
  listeners.forEach((fn) => fn(s, err));
}

export function syncState(): { state: SyncState; error: string | null } {
  return { state, error: lastError };
}

export function onSyncChange(fn: (s: SyncState, e: string | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Called when a repo is connected or disconnected, so the header stops
    saying "not saved" about a repo that is no longer there. */
export function resetSyncState(): void {
  setState(connected() ? "idle" : "off");
}

function active(): boolean {
  return connected();
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* Two entries saved a second apart in the same book would otherwise race:
   both read the same sha, and the second write is rejected. Writes to one
   path queue behind each other instead. */
const queues = new Map<string, Promise<unknown>>();

function serial<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(path) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(
    path,
    next.catch(() => undefined),
  );
  return next;
}

/* — the book catalog — */

/* The catalog is rewritten whole, and the reading position changes it every
   time a page scrolls past, so the push is debounced rather than immediate. */
let libraryTimer: ReturnType<typeof setTimeout> | null = null;

export function pushLibrary(): void {
  if (!active()) return;
  if (libraryTimer) clearTimeout(libraryTimer);
  libraryTimer = setTimeout(() => {
    libraryTimer = null;
    void writeLibrary();
  }, DEBOUNCE);
}

export async function writeLibrary(): Promise<void> {
  if (!active()) return;
  setState("syncing");
  try {
    const books = await db.books.toArray();
    const content = JSON.stringify({ version: 2, books }, null, 2);
    await serial(LIBRARY, () =>
      writeText(LIBRARY, content, `Update the library (${books.length} books)`),
    );
    setState("idle");
  } catch (err) {
    setState("error", message(err));
  }
}

/* — books — */

/** The first folder in the genre that is not taken. Two books with the same
    title under the same genre get -2, -3, the way a person would. */
async function freeDir(genre: string, title: string, format: BookFormat): Promise<number> {
  for (let n = 0; n < 50; n++) {
    if (!(await exists(bookPath(genre, title, format, n)))) return n;
  }
  throw new Error(`There are already 50 books called "${title}" under ${genreDir(genre)}.`);
}

export async function uploadBook(
  bytes: ArrayBuffer,
  fields: { title: string; genre: string; format: BookFormat },
  onProgress?: (fraction: number) => void,
): Promise<string> {
  if (bytes.byteLength > MAX_BOOK_BYTES) {
    const mb = (bytes.byteLength / 1024 / 1024).toFixed(0);
    throw new Error(
      `That file is ${mb}MB. GitHub will not take a file over about 45MB through the API, so this one cannot go in the repo — a compressed copy will.`,
    );
  }
  const n = await freeDir(fields.genre, fields.title, fields.format);
  const path = bookPath(fields.genre, fields.title, fields.format, n);
  await putBinary(path, bytes, `Add ${fields.title} to ${fields.genre}`, onProgress);
  return keyFor(path);
}

export function fetchBook(path: string): Promise<ArrayBuffer> {
  return getBytes(path);
}

/**
 * Books added before a repo was connected have no copy anywhere but this
 * browser, and would show up on another device as a shelf of titles that will
 * not open. Run once on connecting: whatever bytes are still in the cache go
 * up, and the book's key stops being local.
 */
export async function pushLocalBooks(
  onProgress?: (done: number, total: number, title: string) => void,
): Promise<{ pushed: number; stranded: number }> {
  if (!active()) return { pushed: 0, stranded: 0 };
  const local = (await db.books.toArray()).filter((b) => b.fileKey.startsWith("local:"));
  if (local.length === 0) return { pushed: 0, stranded: 0 };

  let pushed = 0;
  let stranded = 0;
  setState("syncing");
  try {
    for (const book of local) {
      onProgress?.(pushed + stranded, local.length, book.title);
      const bytes = await cachedBook(book.fileKey);
      /* The bytes were evicted from Cache Storage at some point; the row is
         all that is left, and there is nothing to upload. */
      if (!bytes || bytes.byteLength > MAX_BOOK_BYTES) {
        stranded++;
        continue;
      }
      const key = await uploadBook(bytes, {
        title: book.title,
        genre: book.genre,
        format: book.format,
      });
      await cacheBook(key, bytes);
      await dropBook(book.fileKey);
      await db.books.update(book.id, { fileKey: key });
      /* Its notes were written to a folder that did not exist yet. */
      await writeBookNotes(book.id, `Move the notes on ${book.title} next to the book`);
      pushed++;
    }
    setState("idle");
  } catch (err) {
    setState("error", message(err));
  }
  return { pushed, stranded };
}

/* — the journal —
   A save is a commit. The message names the book and the entry, so the repo
   history reads as a record of the reading rather than a column of "update
   notes.md". */

function commitMessage(book: Book | undefined, entry: Entry): string {
  const where = book ? book.title : "the journal";
  if (entry.title) return `Note on ${where}: ${entry.title}`;
  if (entry.displayLocation) return `Note on ${where}, ${entry.displayLocation}`;
  return `Note on ${where}`;
}

/** Everything written about one book, rewritten whole into its folder. */
export async function writeBookNotes(bookId: string, message: string): Promise<void> {
  if (!active()) return;
  const book = await db.books.get(bookId);
  if (!book) return;
  const path = notesPathForKey(book.fileKey);
  /* The book itself was never pushed — a local-only book has no folder to
     write into yet. pushLocalBooks comes back for these. */
  if (!path) return;

  const entries = await db.entries.where("bookId").equals(bookId).toArray();
  const heading = book.author ? `${book.title} — ${book.author}` : book.title;
  await serial(path, () =>
    writeText(path, renderEntries(heading, entries, () => book.title), message),
  );
}

/** Entries with no book still go by month; nothing in the interface makes
    one, but the type allows it and they should not vanish. */
async function writeMonth(iso: string, message: string): Promise<void> {
  if (!active()) return;
  const m = monthKey(iso);
  const all = await db.entries.toArray();
  const loose = all.filter((e) => !e.bookId && monthKey(e.createdAt) === m);
  if (loose.length === 0) return;
  const path = monthPath(m);
  await serial(path, () => writeText(path, renderEntries(m, loose, () => undefined), message));
}

/** Called the moment an entry is saved. */
export function noteEntrySaved(entry: Entry): void {
  if (!active()) return;
  void (async () => {
    setState("syncing");
    try {
      if (entry.bookId) {
        const book = await db.books.get(entry.bookId);
        await writeBookNotes(entry.bookId, commitMessage(book, entry));
      } else {
        await writeMonth(entry.createdAt, commitMessage(undefined, entry));
      }
      setState("idle");
    } catch (err) {
      setState("error", message(err));
    }
  })();
}

/* — pulling back down —
   Run once after connecting. The repo wins only where it is newer; an entry
   written offline is never overwritten by a stale copy. */

export async function pullAll(): Promise<{ books: number; entries: number }> {
  if (!active()) return { books: 0, entries: 0 };
  setState("syncing");
  try {
    let bookCount = 0;
    let entryCount = 0;
    const seen = new Set<string>();

    const take = async (markdown: string) => {
      for (const e of parseEntries(markdown)) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        const local = await db.entries.get(e.id);
        if (!local || local.updatedAt < e.updatedAt) {
          await db.entries.put(e);
          entryCount++;
        }
      }
    };

    /* The catalog says where every book's folder is, so the notes are found
       by reading it rather than by walking the tree. */
    const lib = await readText(LIBRARY);
    const books: Book[] = lib ? ((JSON.parse(lib) as { books?: Book[] }).books ?? []) : [];
    for (const b of books) {
      const local = await db.books.get(b.id);
      if (!local) {
        await db.books.put(b);
        bookCount++;
      } else if ((b.lastOpenedAt ?? "") > (local.lastOpenedAt ?? "")) {
        /* A book already here keeps its own copy unless the repo has been
           read more recently — that is what carries a reading position from
           one device to the next. */
        await db.books.put({ ...local, ...b });
      }
      const notes = notesPathForKey(b.fileKey);
      if (notes) {
        const text = await readText(notes);
        if (text) await take(text);
      }
    }

    /* Loose entries, and whatever a month-per-file version of this app left
       behind. Duplicates are skipped by id. */
    for (const m of await list(JOURNAL)) {
      if (m.isDir || !m.name.endsWith(".md")) continue;
      const text = await readText(m.path);
      if (text) await take(text);
    }

    setState("idle");
    return { books: bookCount, entries: entryCount };
  } catch (err) {
    setState("error", message(err));
    throw err;
  }
}

/* A page close should not lose a catalog write that is still on its timer.
   Entries are already committed by the time this runs. */
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && libraryTimer) {
      clearTimeout(libraryTimer);
      libraryTimer = null;
      void writeLibrary();
    }
  });
}
