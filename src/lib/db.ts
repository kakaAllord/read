import Dexie, { type EntityTable } from "dexie";
import type { Book, BookText, Entry, Session } from "./types";

/* IndexedDB is the working copy the UI reads from. The connected GitHub
   repo is the durable store, written through on save. Nothing in the
   interface waits on a network round trip. */

export type Meta = { key: string; value: unknown };

const db = new Dexie("read") as Dexie & {
  books: EntityTable<Book, "id">;
  entries: EntityTable<Entry, "id">;
  texts: EntityTable<BookText, "bookId">;
  sessions: EntityTable<Session, "id">;
  meta: EntityTable<Meta, "key">;
};

const SCHEMA = {
  books: "id, genre, lastOpenedAt, addedAt",
  entries: "id, bookId, createdAt, ref",
  texts: "bookId",
  sessions: "id, bookId, startedAt",
  meta: "key",
};

/* v3 added highlights and questions alongside notes, so entries are queried
   by kind and questions by whether they are still open. */
const SCHEMA_V3 = {
  ...SCHEMA,
  entries: "id, bookId, createdAt, ref, kind, status",
};

db.version(1).stores(SCHEMA);

/* v2 moved off Drive. A book's remote handle used to be a Drive file id and
   is now a repo path with a scheme on it, so the field is renamed in place;
   the Drive folder and file-id rows in meta have nothing left to point at. */
db.version(2)
  .stores(SCHEMA)
  .upgrade(async (tx) => {
    await tx
      .table("books")
      .toCollection()
      .modify((b: Record<string, unknown>) => {
        if (typeof b.driveFileId === "string" && b.fileKey === undefined) {
          b.fileKey = b.driveFileId;
        }
        delete b.driveFileId;
      });
    await tx
      .table("meta")
      .where("key")
      .startsWith("drive.")
      .delete();
  });

/* v4 named things what they are. What v3 called a highlight was a passage
   kept in one colour nobody chose — a bookmark. A highlight is now the thing
   with a colour on it. */
const SCHEMA_V4 = {
  ...SCHEMA_V3,
  entries: "id, bookId, createdAt, ref, kind, status, color",
};

/* v3 gave every entry a kind. Everything written before there was anything
   else to write was a note. */
db.version(3)
  .stores(SCHEMA_V3)
  .upgrade(async (tx) => {
    await tx
      .table("entries")
      .toCollection()
      .modify((e: Record<string, unknown>) => {
        if (e.kind === undefined) e.kind = "note";
      });
  });

/* What v3 stored as a highlight was a mark in a colour nobody picked. That is
   a bookmark, and calling it one leaves the word free for the thing that does
   have a colour on it. Nothing is lost: every mark made before this keeps its
   passage, its page and its date, under the name it should have had. */
db.version(4)
  .stores(SCHEMA_V4)
  .upgrade(async (tx) => {
    await tx
      .table("entries")
      .toCollection()
      .modify((e: Record<string, unknown>) => {
        if (e.kind === "highlight") e.kind = "bookmark";
      });
  });

export { db };

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
