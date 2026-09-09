import { useEffect, useState } from "react";

import ConnectDialog from "./ConnectDialog";
import { config, connected, onConnectionChange } from "../lib/github/config";
import {
  onPendingChange,
  onSyncChange,
  pendingCount,
  saveNow,
  syncState,
  type SyncState,
} from "../lib/sync";

/* Two words in the header, in its own type — 12px, uppercase, tracked — so
   they read as part of that row rather than as widgets bolted onto it. The
   repo name opens the connect dialog; Save is the only thing in the app that
   writes to the repo, and it says how much is waiting so that pressing it is
   a decision rather than a habit. */

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;

const word: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: "pointer",
};

export default function RepoStatus() {
  const [live, setLive] = useState(connected());
  const [sync, setSync] = useState<SyncState>(syncState().state);
  const [error, setError] = useState<string | null>(syncState().error);
  const [waiting, setWaiting] = useState(pendingCount());
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => onConnectionChange(setLive), []);
  useEffect(() => {
    /* The pending set is read back from IndexedDB, which may well have
       finished before this subscribed. Ask once, then listen. */
    const stop = onPendingChange(setWaiting);
    setWaiting(pendingCount());
    return stop;
  }, []);
  useEffect(
    () =>
      onSyncChange((s, e) => {
        setSync(s);
        setError(e);
      }),
    [],
  );

  /* Work waiting with nowhere to put it is worth saying out loud, so the
     count shows before a repo is connected too. */
  const saving = sync === "syncing";

  async function save() {
    if (saving || waiting === 0) return;
    if (!live) {
      setOpen(true);
      return;
    }
    try {
      const { stranded } = await saveNow((what, done, total) =>
        setLabel(`${done + 1}/${total} ${what}`),
      );
      setLabel(null);
      if (stranded.length) {
        setError(
          `Saved, but ${stranded.join(", ")} had no file left on this device to send. Add ${stranded.length === 1 ? "it" : "them"} again to keep ${stranded.length === 1 ? "it" : "them"}.`,
        );
      }
    } catch {
      setLabel(null); // the message is already on the sync state
    }
  }

  const cfg = config();
  const repoWord = !live ? "Local only" : sync === "error" ? "Not saved" : (cfg?.repo ?? "Repo");
  const repoColor = !live ? muted(38) : sync === "error" ? "var(--color-accent-700)" : muted(45);
  const repoTitle = !live
    ? "Nothing leaves this device. Click to connect a repository."
    : (error ?? `Connected to ${cfg?.owner}/${cfg?.repo} — click to change it`);

  return (
    <>
      {waiting > 0 && (
        <div
          onClick={() => void save()}
          title={
            live
              ? `${waiting} unsaved ${waiting === 1 ? "change" : "changes"} — click to commit ${waiting === 1 ? "it" : "them"} to ${cfg?.owner}/${cfg?.repo}`
              : `${waiting} unsaved ${waiting === 1 ? "change" : "changes"}. Connect a repository to put ${waiting === 1 ? "it" : "them"} somewhere.`
          }
          className={saving ? "spin" : undefined}
          style={{
            ...word,
            color: saving ? muted(45) : "var(--color-accent)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {saving ? (label ?? "Saving") : `Save ${waiting}`}
        </div>
      )}
      <div onClick={() => setOpen(true)} title={repoTitle} style={{ ...word, color: repoColor }}>
        {repoWord}
      </div>
      {open && <ConnectDialog onClose={() => setOpen(false)} />}
    </>
  );
}
