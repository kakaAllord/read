import { db, getMeta, setMeta } from "../db";
import { monthKey } from "../dates";
import type { Book, Entry } from "../types";
import { ensureFolder, findFile, getFileText, putTextFile, uploadResumable } from "./api";
import { driveConfigured, isSignedIn } from "./auth";
import { renderMonth, parseMonth } from "./journalFile";

/*  read/
      library.json          book catalog
      books/                uploaded files
      journal/
        2026-09.md          one file per month

    IndexedDB is what the interface reads. Drive is what survives it. Writes
    go through on save, debounced, and a failed write leaves the local copy
    untouched and marks the month dirty for the next attempt. */

const ROOT = "read";
const BOOKS = "books";
const JOURNAL = "journal";
const DEBOUNCE = 2500;

export type SyncState = "off" | "idle" | "syncing" | "error";

let state: SyncState = driveConfigured ? "idle" : "off";
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

type Folders = { root: string; books: string; journal: string };
let folders: Folders | null = null;

export async function ensureFolders(): Promise<Folders> {
  if (folders) return folders;
  const cached = await getMeta<Folders | null>("drive.folders", null);
  if (cached) {
    folders = cached;
    return cached;
  }
  const root = await ensureFolder(ROOT);
  const books = await ensureFolder(BOOKS, root);
  const journal = await ensureFolder(JOURNAL, root);
  folders = { root, books, journal };
  await setMeta("drive.folders", folders);
  return folders;
}

function active(): boolean {
  return driveConfigured && isSignedIn();
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
    const f = await ensureFolders();
    const books = await db.books.toArray();
    const id = await getMeta<string | null>("drive.libraryId", null);
    const content = JSON.stringify({ version: 1, books }, null, 2);
    const file = await putTextFile(
      "library.json",
      f.root,
      content,
      "application/json",
      id ?? undefined,
    );
    if (!id) await setMeta("drive.libraryId", file.id);
    setState("idle");
  } catch (err) {
    setState("error", err instanceof Error ? err.message : String(err));
  }
}

export async function uploadBookFile(
  file: File,
  onProgress?: (f: number) => void,
): Promise<string> {
  const f = await ensureFolders();
  const uploaded = await uploadResumable(file, file.name, f.books, onProgress);
  return uploaded.id;
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
    const f = await ensureFolders();
    const books = await db.books.toArray();
    const titleOf = (id?: string) => books.find((b) => b.id === id)?.title;
    const ids = await getMeta<Record<string, string>>("drive.journalIds", {});

    for (const m of months) {
      const all = await db.entries.toArray();
      const inMonth = all.filter((e) => monthKey(e.createdAt) === m);
      const name = `${m}.md`;
      let fileId = ids[m];
      if (!fileId) {
        const existing = await findFile(name, f.journal);
        if (existing) fileId = existing.id;
      }
      const saved = await putTextFile(
        name,
        f.journal,
        renderMonth(m, inMonth, titleOf),
        "text/markdown",
        fileId,
      );
      ids[m] = saved.id;
    }
    await setMeta("drive.journalIds", ids);
    setState("idle");
  } catch (err) {
    months.forEach((m) => dirty.add(m));
    setState("error", err instanceof Error ? err.message : String(err));
  }
}

/* — pulling back down —
   Run once after sign-in. Drive wins only where it is newer; a local entry
   edited offline is never overwritten by a stale copy. */

export async function pullAll(): Promise<{ books: number; entries: number }> {
  if (!active()) return { books: 0, entries: 0 };
  setState("syncing");
  try {
    const f = await ensureFolders();
    let bookCount = 0;
    let entryCount = 0;

    const lib = await findFile("library.json", f.root);
    if (lib) {
      await setMeta("drive.libraryId", lib.id);
      const parsed = JSON.parse(await getFileText(lib.id)) as { books?: Book[] };
      for (const b of parsed.books ?? []) {
        const local = await db.books.get(b.id);
        if (!local) {
          await db.books.put(b);
          bookCount++;
        }
      }
    }

    const { listFiles } = await import("./api");
    const months = await listFiles(`'${f.journal}' in parents and trashed = false`);
    const ids = await getMeta<Record<string, string>>("drive.journalIds", {});
    for (const m of months) {
      if (!m.name.endsWith(".md")) continue;
      ids[m.name.replace(/\.md$/, "")] = m.id;
      const parsed = parseMonth(await getFileText(m.id));
      for (const e of parsed) {
        const local = await db.entries.get(e.id);
        if (!local || local.updatedAt < e.updatedAt) {
          await db.entries.put(e);
          entryCount++;
        }
      }
    }
    await setMeta("drive.journalIds", ids);
    setState("idle");
    return { books: bookCount, entries: entryCount };
  } catch (err) {
    setState("error", err instanceof Error ? err.message : String(err));
    return { books: 0, entries: 0 };
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
