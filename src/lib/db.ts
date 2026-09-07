import Dexie, { type EntityTable } from "dexie";
import type { Book, BookText, Entry, Session } from "./types";

/* IndexedDB is the working copy the UI reads from. Drive is the durable
   store, written through on save. Nothing in the interface waits on a
   network round trip. */

export type Meta = { key: string; value: unknown };

const db = new Dexie("read") as Dexie & {
  books: EntityTable<Book, "id">;
  entries: EntityTable<Entry, "id">;
  texts: EntityTable<BookText, "bookId">;
  sessions: EntityTable<Session, "id">;
  meta: EntityTable<Meta, "key">;
};

db.version(1).stores({
  books: "id, genre, lastOpenedAt, addedAt",
  entries: "id, bookId, createdAt, ref",
  texts: "bookId",
  sessions: "id, bookId, startedAt",
  meta: "key",
});

export { db };

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
