import { db, getMeta, setMeta } from "./db";
import { cacheBook, cachedBook, dropBook } from "./cache";
import { monthKey } from "./dates";
import type { Book, Entry } from "./types";
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

    IndexedDB is what the interface reads and writes, always, immediately.

    A book is pushed as soon as it is added: the file is the one thing here
    that cannot be written again from memory. Everything written *about* a
    book waits for Save — nothing is committed on a timer, on a scroll, or on
    the way out of the tab, because a note is something you decided to make
    and a commit should be too. What is waiting is remembered across reloads,
    so closing the tab with work pending loses nothing but the pushing of
    it. */

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

export function resetSyncState(): void {
  setState(connected() ? "idle" : "off");
}

function active(): boolean {
  return connected();
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* — what is waiting to go up —
   Kept in IndexedDB rather than in memory: a reload should not forget that
   three books' notes were never pushed. */

const BOOKS_KEY = "pending.books";
const LIBRARY_KEY = "pending.library";

let pendingBooks: string[] = [];
let pendingLibrary = false;
const pendingListeners = new Set<(count: number) => void>();

export function pendingCount(): number {
  return pendingBooks.length + (pendingLibrary ? 1 : 0);
}

export function onPendingChange(fn: (count: number) => void): () => void {
  pendingListeners.add(fn);
  return () => pendingListeners.delete(fn);
}

function announce() {
  const n = pendingCount();
  pendingListeners.forEach((fn) => fn(n));
}

async function persist() {
  await setMeta(BOOKS_KEY, pendingBooks);
  await setMeta(LIBRARY_KEY, pendingLibrary);
}

async function restore() {
  pendingBooks = await getMeta<string[]>(BOOKS_KEY, []);
  pendingLibrary = await getMeta<boolean>(LIBRARY_KEY, false);
  announce();
}
void restore();

/** An entry was written, or a book was added — that book's folder is out of
    date in the repo until the next save. */
export function markBookChanged(bookId: string): void {
  if (!pendingBooks.includes(bookId)) pendingBooks.push(bookId);
  void persist();
  announce();
}

/** The catalog changed: a book added, a view mode flipped, a reading position
    moved. None of it worth a commit on its own. */
export function markLibraryChanged(): void {
  if (pendingLibrary) return;
  pendingLibrary = true;
  void persist();
  announce();
}

/* — books — */

/** The first folder in the genre that is not taken. Two books with the same
    title under the same genre get -2, -3, the way a person would. */
async function freeDir(genre: string, title: string): Promise<number> {
  for (let n = 0; n < 50; n++) {
    if (!(await exists(bookPath(genre, title, n)))) return n;
  }
  throw new Error(`There are already 50 books called "${title}" under ${genreDir(genre)}.`);
}

async function uploadBook(
  book: Book,
  bytes: ArrayBuffer,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  if (bytes.byteLength > MAX_BOOK_BYTES) {
    const mb = (bytes.byteLength / 1024 / 1024).toFixed(0);
    throw new Error(
      `"${book.title}" is ${mb}MB. GitHub will not take a file over about 45MB through the API, so it cannot go in the repo — a compressed copy will.`,
    );
  }
  const n = await freeDir(book.genre, book.title);
  const path = bookPath(book.genre, book.title, n);
  await putBinary(path, bytes, `Add ${book.title} to ${book.genre}`, onProgress);
  return keyFor(path);
}

export function fetchBook(path: string): Promise<ArrayBuffer> {
  return getBytes(path);
}

/**
 * A book goes into the repo the moment it is added, and does not wait for
 * Save. The file is the one thing here that cannot be written again from
 * memory, so leaving it in a browser cache until you remember to press
 * something is the wrong default. Notes are the opposite: those are yours to
 * decide on, and they keep waiting.
 *
 * The catalog is rewritten in the same breath, because a book in the repo
 * that `library.json` does not mention is not findable from another device.
 */
export async function pushNewBook(
  book: Book,
  bytes: ArrayBuffer,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  if (!active()) throw new Error("No repository is connected.");
  setState("syncing");
  try {
    const key = await uploadBook(book, bytes, onProgress);
    await cacheBook(key, bytes);
    await dropBook(book.fileKey);
    await db.books.update(book.id, { fileKey: key });
    await writeLibrary();
    pendingLibrary = false;
    await persist();
    announce();
    setState("idle");
    return key;
  } catch (err) {
    setState("error", message(err));
    throw err;
  }
}

/* — writing what is pending — */

/** Everything written about one book, rewritten whole into its folder. */
async function writeBookNotes(book: Book): Promise<void> {
  const path = notesPathForKey(book.fileKey);
  if (!path) return; // never pushed; nowhere to write yet
  const entries = await db.entries.where("bookId").equals(book.id).toArray();
  if (entries.length === 0) return;
  const heading = book.author ? `${book.title} — ${book.author}` : book.title;
  const count = `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
  await writeText(
    path,
    renderEntries(heading, entries, () => book.title),
    `Notes on ${book.title} (${count})`,
  );
}

/** Entries with no book go by month; nothing in the interface makes one, but
    the type allows it and they should not vanish. */
async function writeLooseEntries(): Promise<void> {
  const loose = (await db.entries.toArray()).filter((e) => !e.bookId);
  const months = new Set(loose.map((e) => monthKey(e.createdAt)));
  for (const m of months) {
    const inMonth = loose.filter((e) => monthKey(e.createdAt) === m);
    await writeText(
      monthPath(m),
      renderEntries(m, inMonth, () => undefined),
      `Journal ${m} (${inMonth.length} ${inMonth.length === 1 ? "entry" : "entries"})`,
    );
  }
}

async function writeLibrary(): Promise<void> {
  const books = await db.books.toArray();
  const content = JSON.stringify({ version: 2, books }, null, 2);
  await writeText(LIBRARY, content, `Update the library (${books.length} books)`);
}

export type SaveResult = { books: number; library: boolean; stranded: string[] };

/**
 * The only thing that writes to the repo. Uploads any book that has never
 * been up, rewrites the notes of every book that changed, then the catalog.
 * Each file is its own commit with its own message; what fails stays pending
 * so the next save picks it up.
 */
export async function saveNow(
  onProgress?: (label: string, done: number, total: number) => void,
): Promise<SaveResult> {
  if (!active()) throw new Error("No repository is connected.");
  const ids = [...pendingBooks];
  const total = ids.length + (pendingLibrary ? 1 : 0);
  if (total === 0) return { books: 0, library: false, stranded: [] };

  setState("syncing");
  let done = 0;
  let saved = 0;
  const stranded: string[] = [];

  try {
    for (const id of ids) {
      const book = await db.books.get(id);
      if (!book) {
        pendingBooks = pendingBooks.filter((b) => b !== id);
        continue;
      }
      onProgress?.(book.title, done, total);

      /* A book added before the repo was connected, or before the last save,
         has no copy anywhere but this browser. */
      if (!notesPathForKey(book.fileKey)) {
        const bytes = await cachedBook(book.fileKey);
        if (!bytes) {
          /* The bytes were evicted from Cache Storage; the row is all that is
             left and there is nothing to upload. */
          stranded.push(book.title);
          pendingBooks = pendingBooks.filter((b) => b !== id);
          done++;
          continue;
        }
        const key = await uploadBook(book, bytes);
        await cacheBook(key, bytes);
        await dropBook(book.fileKey);
        await db.books.update(book.id, { fileKey: key });
        book.fileKey = key;
        pendingLibrary = true; // the catalog now points somewhere else
      }

      await writeBookNotes(book);
      pendingBooks = pendingBooks.filter((b) => b !== id);
      await persist();
      announce();
      saved++;
      done++;
    }

    await writeLooseEntries();

    if (pendingLibrary) {
      onProgress?.("the library", done, total);
      await writeLibrary();
      pendingLibrary = false;
      await persist();
      announce();
    }

    setState("idle");
    return { books: saved, library: true, stranded };
  } catch (err) {
    await persist();
    announce();
    setState("error", message(err));
    throw err;
  }
}

/* — pulling back down —
   Run on connecting. The repo wins only where it is newer; an entry written
   offline is never overwritten by a stale copy. */

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

export function noteEntrySaved(entry: Entry): void {
  if (entry.bookId) markBookChanged(entry.bookId);
  else markLibraryChanged(); // a loose entry rides along with the next save
}
