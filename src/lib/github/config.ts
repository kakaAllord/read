/* The repo is the whole configuration: which one, which branch, and a
   fine-grained token with Contents write on it and nothing else. There is no
   OAuth app and no backend to hold a secret, so the token is pasted in once
   and kept in localStorage — which also means anyone with this browser
   profile has it. Scope it to the one private repo. */

export type RepoConfig = {
  owner: string;
  repo: string;
  branch: string;
  token: string;
};

const KEY = "read.github";

function read(): RepoConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as RepoConfig;
    return c.owner && c.repo && c.token ? c : null;
  } catch {
    return null;
  }
}

let current: RepoConfig | null = read();
const listeners = new Set<(connected: boolean) => void>();

export function config(): RepoConfig | null {
  return current;
}

export function connected(): boolean {
  return current !== null;
}

export function setConfig(next: RepoConfig | null): void {
  current = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode, or storage disabled — the session still works */
  }
  listeners.forEach((fn) => fn(next !== null));
}

export function onConnectionChange(fn: (connected: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export class NotConnected extends Error {
  constructor() {
    super("No repository is connected.");
  }
}

/** "owner/name", the way GitHub writes it, into its two halves. */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  const m = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/.exec(cleaned);
  return m ? { owner: m[1], repo: m[2] } : null;
}
