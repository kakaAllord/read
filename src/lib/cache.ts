/* A book's bytes are fetched once and kept in Cache Storage, so opening it
   again costs nothing and a lapsed token stops saving without stopping
   reading. */
const CACHE = "read-books-v1";

function keyFor(fileKey: string): string {
  return `https://read.local/book/${fileKey}`;
}

export async function cachedBook(fileKey: string): Promise<ArrayBuffer | null> {
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(keyFor(fileKey));
    return hit ? await hit.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function cacheBook(fileKey: string, bytes: ArrayBuffer): Promise<void> {
  try {
    const cache = await caches.open(CACHE);
    await cache.put(keyFor(fileKey), new Response(bytes.slice(0)));
  } catch {
    /* quota, or a browser with Cache Storage disabled — not fatal */
  }
}

export async function dropBook(fileKey: string): Promise<void> {
  try {
    const cache = await caches.open(CACHE);
    await cache.delete(keyFor(fileKey));
  } catch {
    /* ignore */
  }
}
