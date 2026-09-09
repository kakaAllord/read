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

export { db };

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
