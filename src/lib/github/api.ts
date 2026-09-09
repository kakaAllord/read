import { config, NotConnected, type RepoConfig } from "./config";

/* The Contents API is the whole client. It is addressed by path rather than
   by file id, which is what lets a book keep its own folder — the file and
   the notes on it together — and it commits on every write, so the repo ends
   up holding the history of the reading as well as its state. */

const API = "https://api.github.com";
const VERSION = "2022-11-28";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/* Path segments are encoded, the separators are not — the API wants
   books/faith/a%20title.pdf, not books%2Ffaith%2F… */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function base(cfg: RepoConfig): string {
  return `${API}/repos/${cfg.owner}/${cfg.repo}`;
}

function headers(cfg: RepoConfig, accept: string): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.token}`,
    Accept: accept,
    "X-GitHub-Api-Version": VERSION,
  };
}

function need(): RepoConfig {
  const cfg = config();
  if (!cfg) throw new NotConnected();
  return cfg;
}

/* GitHub puts the useful part of a failure in a JSON `message`; the raw body
   is a wall of documentation URLs. */
async function fail(res: Response): Promise<never> {
  const body = await res.text().catch(() => "");
  let message = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed.message) message = parsed.message;
  } catch {
    /* not JSON — keep the raw text */
  }
  throw new HttpError(res.status, `GitHub ${res.status}: ${message}`);
}

/* — base64, in chunks, because a book is too big for one apply() — */

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x2000; // small enough that the spread stays inside every engine's argument limit
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\s/g, ""));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/* — the blob shas, which every update has to quote — */

const shas = new Map<string, string>();

export function forgetSha(path: string): void {
  shas.delete(path);
}

type ContentsFile = {
  type: string;
  name: string;
  path: string;
  sha: string;
  size: number;
  content?: string;
};

async function stat(path: string): Promise<ContentsFile | null> {
  const cfg = need();
  const url = `${base(cfg)}/contents/${encodePath(path)}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, { headers: headers(cfg, "application/vnd.github+json") });
  if (res.status === 404) return null;
  if (!res.ok) await fail(res);
  const json = (await res.json()) as ContentsFile;
  shas.set(path, json.sha);
  return json;
}

async function shaFor(path: string): Promise<string | undefined> {
  const known = shas.get(path);
  if (known) return known;
  const found = await stat(path);
  return found?.sha;
}

/* — reading — */

/** The text of a file, or null if the repo does not have one there yet. */
export async function readText(path: string): Promise<string | null> {
  const found = await stat(path);
  if (!found || !found.content) return null;
  return new TextDecoder().decode(fromBase64(found.content));
}

/** A book's bytes. The raw media type is what lifts this over the 1MB the
    JSON form is capped at. */
export async function getBytes(path: string): Promise<ArrayBuffer> {
  const cfg = need();
  const url = `${base(cfg)}/contents/${encodePath(path)}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, { headers: headers(cfg, "application/vnd.github.raw") });
  if (!res.ok) await fail(res);
  return res.arrayBuffer();
}

export type DirEntry = { name: string; path: string; size: number; isDir: boolean };

/** The files in a directory. A directory that is not there yet is empty. */
export async function list(dir: string): Promise<DirEntry[]> {
  const cfg = need();
  const url = `${base(cfg)}/contents/${encodePath(dir)}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, { headers: headers(cfg, "application/vnd.github+json") });
  if (res.status === 404) return [];
  if (!res.ok) await fail(res);
  const json = (await res.json()) as ContentsFile[];
  if (!Array.isArray(json)) return [];
  return json.map((f) => ({
    name: f.name,
    path: f.path,
    size: f.size,
    isDir: f.type === "dir",
  }));
}

export async function exists(path: string): Promise<boolean> {
  return (await stat(path)) !== null;
}

/* — writing —
   Every write quotes the blob's sha, which is GitHub's way of saying "the
   version I read is the version I am replacing". A stale sha comes back as a
   409 or a 422, and that is the signal another device wrote first. */

type PutBody = { message: string; content: string; branch: string; sha?: string };

function body(message: string, content: string, cfg: RepoConfig, sha?: string): string {
  const payload: PutBody = { message, content, branch: cfg.branch };
  if (sha) payload.sha = sha;
  return JSON.stringify(payload);
}

async function put(path: string, content: string, message: string): Promise<string> {
  const cfg = need();
  const send = (sha: string | undefined) =>
    fetch(`${base(cfg)}/contents/${encodePath(path)}`, {
      method: "PUT",
      headers: {
        ...headers(cfg, "application/vnd.github+json"),
        "Content-Type": "application/json",
      },
      body: body(message, content, cfg, sha),
    });

  let res = await send(await shaFor(path));
  if (res.status === 409 || res.status === 422) {
    forgetSha(path);
    res = await send(await shaFor(path));
  }
  if (!res.ok) await fail(res);
  return remember(path, await res.json());
}

function remember(path: string, json: unknown): string {
  const sha = (json as { content?: { sha?: string } }).content?.sha;
  if (sha) shas.set(path, sha);
  return sha ?? "";
}

export function writeText(path: string, content: string, message: string): Promise<string> {
  return put(path, toBase64(new TextEncoder().encode(content)), message);
}

/**
 * A book, with a progress bar. The Contents API takes one JSON body rather
 * than a resumable session, so the file is base64 in memory and XHR is what
 * makes the upload measurable rather than a spinner.
 */
export function putBinary(
  path: string,
  bytes: ArrayBuffer,
  message: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const cfg = need();
  const content = toBase64(new Uint8Array(bytes));

  const send = (sha: string | undefined) =>
    new Promise<{ status: number; text: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `${base(cfg)}/contents/${encodePath(path)}`, true);
      for (const [k, v] of Object.entries(headers(cfg, "application/vnd.github+json"))) {
        xhr.setRequestHeader(k, v);
      }
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total);
      };
      xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => reject(new HttpError(0, "The upload connection failed."));
      xhr.send(body(message, content, cfg, sha));
    });

  return (async () => {
    let res = await send(await shaFor(path));
    if (res.status === 409 || res.status === 422) {
      forgetSha(path);
      res = await send(await shaFor(path));
    }
    if (res.status < 200 || res.status >= 300) {
      await fail(new Response(res.text, { status: res.status }));
    }
    onProgress?.(1);
    return remember(path, JSON.parse(res.text));
  })();
}

/* — connecting — */

export type RepoInfo = {
  fullName: string;
  private: boolean;
  defaultBranch: string;
  canWrite: boolean;
};

/** Checks the repo is reachable and the token may write to it, before any of
    it is saved. Throws in GitHub's own wording where that is clearer. */
export async function verify(cfg: RepoConfig): Promise<RepoInfo> {
  const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}`, {
    headers: headers(cfg, "application/vnd.github+json"),
  });
  if (res.status === 404) {
    throw new HttpError(
      404,
      "No such repository, or this token cannot see it. A fine-grained token has to name the repository under Repository access.",
    );
  }
  if (res.status === 401) {
    throw new HttpError(
      401,
      "GitHub rejected the token. Check it was copied whole and has not expired.",
    );
  }
  if (!res.ok) await fail(res);
  const json = (await res.json()) as {
    full_name: string;
    private: boolean;
    default_branch: string;
    permissions?: { push?: boolean; admin?: boolean };
  };
  return {
    fullName: json.full_name,
    private: json.private,
    defaultBranch: json.default_branch,
    canWrite: Boolean(json.permissions?.push || json.permissions?.admin),
  };
}
