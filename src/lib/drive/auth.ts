/* Google Identity Services issues the access token in the browser; there is
   no backend and no refresh token. Tokens last about an hour, so every call
   goes through withToken(), which catches a 401, asks for a new token
   without a prompt, and retries once. If the book's bytes are already in
   Cache Storage, reading carries on through all of that and only saving
   waits. */

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const GIS_SRC = "https://accounts.google.com/gsi/client";

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
export const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
export const driveConfigured = Boolean(CLIENT_ID);

type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (c: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type?: string }) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
    gapi?: { load: (name: string, cb: () => void) => void };
  }
}

let scriptPromise: Promise<void> | null = null;

export function loadGis(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const el = document.createElement("script");
    el.src = GIS_SRC;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Google Identity Services failed to load."));
    document.head.appendChild(el);
  });
  return scriptPromise;
}

const STORE = "read.token";
type Stored = { token: string; expiresAt: number };

let current: Stored | null = readStored();
let pending: Promise<string> | null = null;
const listeners = new Set<(signedIn: boolean) => void>();

function readStored(): Stored | null {
  try {
    const raw = sessionStorage.getItem(STORE);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    return s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

function write(s: Stored | null) {
  current = s;
  try {
    if (s) sessionStorage.setItem(STORE, JSON.stringify(s));
    else sessionStorage.removeItem(STORE);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(Boolean(s)));
}

export function onAuthChange(fn: (signedIn: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isSignedIn(): boolean {
  return Boolean(current && current.expiresAt > Date.now());
}

export class DriveNotConfigured extends Error {
  constructor() {
    super("Drive is not configured — set VITE_GOOGLE_CLIENT_ID in .env.");
  }
}

async function request(interactive: boolean): Promise<string> {
  if (!CLIENT_ID) throw new DriveNotConfigured();
  await loadGis();
  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      prompt: interactive ? "" : "none",
      callback: (r) => {
        if (r.access_token) {
          write({
            token: r.access_token,
            expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 - 60_000,
          });
          resolve(r.access_token);
        } else {
          reject(new Error(r.error ?? "Google did not return an access token."));
        }
      },
      error_callback: (e) => reject(new Error(e.type ?? "Sign-in was dismissed.")),
    });
    client.requestAccessToken({ prompt: interactive ? "" : "none" });
  });
}

/** Interactive: shows the Google consent screen if it has to. */
export async function signIn(): Promise<string> {
  const t = await request(true);
  return t;
}

export function signOut(): void {
  const t = current?.token;
  write(null);
  if (t) window.google?.accounts.oauth2.revoke(t);
}

/** Silent: reuses the session, never prompts. Throws if it cannot. */
export async function getToken(): Promise<string> {
  if (current && current.expiresAt > Date.now()) return current.token;
  if (!pending) {
    pending = request(false).finally(() => {
      pending = null;
    });
  }
  return pending;
}

/**
 * Runs `fn` with a live token. A 401 means the token expired mid-flight:
 * drop it, ask for another without prompting, and run `fn` once more.
 */
export async function withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const token = await getToken();
  try {
    return await fn(token);
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      write(null);
      const fresh = await getToken();
      return fn(fresh);
    }
    throw err;
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
