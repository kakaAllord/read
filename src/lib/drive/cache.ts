/* A book's bytes are fetched once and kept in Cache Storage, so opening it
   again costs nothing and a lapsed token stops saving without stopping
   reading. */
const CACHE = "read-books-v1";

function keyFor(driveFileId: string): string {
  return `https://read.local/book/${driveFileId}`;
}

export async function cachedBook(driveFileId: string): Promise<ArrayBuffer | null> {
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(keyFor(driveFileId));
    return hit ? await hit.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function cacheBook(driveFileId: string, bytes: ArrayBuffer): Promise<void> {
  try {
    const cache = await caches.open(CACHE);
    await cache.put(keyFor(driveFileId), new Response(bytes.slice(0)));
  } catch {
    /* quota, or a browser with Cache Storage disabled — not fatal */
  }
}

export async function dropBook(driveFileId: string): Promise<void> {
  try {
    const cache = await caches.open(CACHE);
    await cache.delete(keyFor(driveFileId));
  } catch {
    /* ignore */
  }
}
