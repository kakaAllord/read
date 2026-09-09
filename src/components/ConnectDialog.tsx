import { useState } from "react";

import { verify } from "../lib/github/api";
import { config, connected, parseRepo, setConfig } from "../lib/github/config";
import { pendingCount, pullAll, resetSyncState } from "../lib/sync";

/* Connecting is three fields and one round trip. The repo is checked before
   anything is stored, so a typo in the name or a token without write on it
   is a sentence in this dialog rather than a failed save an hour later. */

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;

const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

type Props = { onClose: () => void };

export default function ConnectDialog({ onClose }: Props) {
  const existing = config();
  const [repo, setRepo] = useState(existing ? `${existing.owner}/${existing.repo}` : "");
  const [token, setToken] = useState(existing?.token ?? "");
  const [branch, setBranch] = useState(existing?.branch ?? "main");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    if (busy) return;
    const parsed = parseRepo(repo);
    if (!parsed) {
      setError("Write the repository as owner/name.");
      return;
    }
    if (!token.trim()) {
      setError("Paste a token.");
      return;
    }

    setBusy(true);
    setError(null);
    setNote("Checking the repository");
    const candidate = { ...parsed, branch: branch.trim() || "main", token: token.trim() };

    try {
      const info = await verify(candidate);
      if (!info.canWrite) {
        throw new Error(
          `The token can read ${info.fullName} but not write to it. Give it Contents: Read and write.`,
        );
      }
      setConfig({ ...candidate, branch: branch.trim() || info.defaultBranch });
      resetSyncState();

      /* Connecting reads; it does not write. Anything already in this
         browser stays pending until Save is pressed. */
      setNote("Reading what is already there");
      const { books, entries } = await pullAll();

      const came =
        books || entries
          ? `${entries} ${entries === 1 ? "entry" : "entries"} and ${books} ${books === 1 ? "book" : "books"} came down.`
          : "Nothing was in it yet.";
      const waiting = pendingCount();
      const todo = waiting
        ? ` ${waiting} ${waiting === 1 ? "change is" : "changes are"} waiting here — press Save in the header to put ${waiting === 1 ? "it" : "them"} in the repo.`
        : "";
      setNote(`Connected. ${came}${todo}`);
      setBusy(false);
      setTimeout(onClose, waiting ? 5000 : 1800);
    } catch (err) {
      /* A failed pull leaves a connection that half works; better to have
         none than to have the header claim everything is saved. */
      setConfig(null);
      resetSyncState();
      setError(err instanceof Error ? err.message : String(err));
      setNote(null);
      setBusy(false);
    }
  }

  function disconnect() {
    setConfig(null);
    resetSyncState();
    onClose();
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="dialog">
        <div className="dialog-title">{connected() ? "The connected repository" : "Connect a repository"}</div>
        <div className="dialog-body">
          A private repo holds the journal, the catalog and the books. Connect the same one
          anywhere and the writing is there. Connecting only reads — nothing is written until
          you press Save.
        </div>

        <div className="field">
          <label>Repository</label>
          <input
            className="input"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="yourname/reading"
            spellCheck={false}
            autoCapitalize="none"
          />
        </div>

        <div className="field">
          <label>Token</label>
          <input
            className="input"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_…"
            spellCheck={false}
            autoCapitalize="none"
          />
        </div>

        <div className="field">
          <label>Branch</label>
          <input
            className="input"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            spellCheck={false}
            autoCapitalize="none"
          />
        </div>

        <div
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            color: muted(62),
            borderLeft: "2px solid var(--color-accent-300)",
            paddingLeft: 12,
          }}
        >
          A{" "}
          <a
            href={TOKEN_URL}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--color-accent-700)", textUnderlineOffset: 3 }}
          >
            fine-grained token
          </a>{" "}
          with this one repository selected and <em>Contents: Read and write</em> — nothing else.
          It is kept in this browser, so it is worth giving it an expiry and keeping the repo
          private.
        </div>

        {note && (
          <div style={{ fontSize: 12, lineHeight: 1.6, color: muted(62) }}>{note}</div>
        )}
        {error && (
          <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--color-accent-800)" }}>
            {error}
          </div>
        )}

        <div className="dialog-actions">
          {connected() && (
            <button
              className="btn btn-secondary"
              onClick={disconnect}
              disabled={busy}
              style={{ marginRight: "auto" }}
            >
              Disconnect
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button className="btn btn-primary" onClick={() => void connect()} disabled={busy}>
            {connected() ? "Reconnect" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
