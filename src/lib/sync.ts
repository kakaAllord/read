import { db } from "./db";
import { cacheBook, cachedBook, dropBook } from "./cache";
import { monthKey } from "./dates";
import type { Book, BookFormat, Entry } from "./types";
import { exists, getBytes, list, putBinary, readText, writeText } from "./github/api";
import { connected } from "./github/config";
import { bookPath, genreDir, keyFor, LIBRARY, monthPath, JOURNAL } from "./github/paths";
import { renderMonth, parseMonth } from "./journalFile";

/*  library.json          book catalog
    books/<genre>/…       the files, filed under the genre they were given
    journal/
      2026-09.md          one file per month

    IndexedDB is what the interface reads. The repo is what survives it, and
    what makes the same journal appear in a browser that has never seen it.
    Writes go through on save, debounced, and a failed write leaves the local
    copy untouched and marks the month dirty for the next attempt. */

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
    const content = JSON.stringify({ version: 1, books }, null, 2);
    await writeText(LIBRARY, content, `Update the library (${books.length} books)`);
    setState("idle");
  } catch (err) {
    setState("error", message(err));
  }
}

/* — books — */

/** The first path in the genre folder that is not taken. Two books with the
    same title under the same genre get -2, -3, the way a person would. */
async function freePath(genre: string, title: string, format: BookFormat): Promise<string> {
  for (let n = 0; n < 50; n++) {
    const path = bookPath(genre, title, format, n);
    if (!(await exists(path))) return path;
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
  const path = await freePath(fields.genre, fields.title, fields.format);
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
      pushed++;
    }
    setState("idle");
  } catch (err) {
    setState("error", message(err));
  }
  return { pushed, stranded };
}

/* — the journal — */

const dirty = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function queueMonth(iso: string): void {
  if (!active()) return;
  dirty.add(monthKey(iso));
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushMonths(), DEBOUNCE);
}

export async function flushMonths(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!active() || dirty.size === 0) return;
  const months = [...dirty];
  dirty.clear();
  setState("syncing");
  try {
    const books = await db.books.toArray();
    const titleOf = (id?: string) => books.find((b) => b.id === id)?.title;
    const all = await db.entries.toArray();

    for (const m of months) {
      const inMonth = all.filter((e) => monthKey(e.createdAt) === m);
      await writeText(
        monthPath(m),
        renderMonth(m, inMonth, titleOf),
        `Journal ${m} (${inMonth.length} ${inMonth.length === 1 ? "entry" : "entries"})`,
      );
    }
    setState("idle");
  } catch (err) {
    months.forEach((m) => dirty.add(m));
    setState("error", message(err));
  }
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

    const lib = await readText(LIBRARY);
    if (lib) {
      const parsed = JSON.parse(lib) as { books?: Book[] };
      for (const b of parsed.books ?? []) {
        const local = await db.books.get(b.id);
        /* A book already here keeps its own copy unless the repo has been
           read more recently — that is what carries a reading position from
           one device to the next. */
        if (!local) {
          await db.books.put(b);
          bookCount++;
        } else if ((b.lastOpenedAt ?? "") > (local.lastOpenedAt ?? "")) {
          await db.books.put({ ...local, ...b });
        }
      }
    }

    const months = await list(JOURNAL);
    for (const m of months) {
      if (m.isDir || !m.name.endsWith(".md")) continue;
      const text = await readText(m.path);
      if (!text) continue;
      for (const e of parseMonth(text)) {
        const local = await db.entries.get(e.id);
        if (!local || local.updatedAt < e.updatedAt) {
          await db.entries.put(e);
          entryCount++;
        }
      }
    }
    setState("idle");
    return { books: bookCount, entries: entryCount };
  } catch (err) {
    setState("error", message(err));
    throw err;
  }
}

export function noteEntrySaved(entry: Entry): void {
  queueMonth(entry.createdAt);
}

/* A page close should not lose the last two seconds of writing. */
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushMonths();
      if (libraryTimer) {
        clearTimeout(libraryTimer);
        libraryTimer = null;
        void writeLibrary();
      }
    }
  });
}
