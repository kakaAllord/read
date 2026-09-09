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

/* The mark says where the writing goes, and how faded it is says whether it
   is going anywhere yet: dim for no repository, inked for one, accent when a
   save did not land. Which repo it is belongs in the tooltip and the dialog,
   which is where you would look for it.

   Save stays a word, because it is the one thing here carrying a number and
   an icon cannot say "three". It is also the only thing in the app that
   writes to the repo, so it says how much is waiting — pressing it should be
   a decision rather than a habit. */

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden focusable="false">
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

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
  const markColor = !live ? muted(26) : sync === "error" ? "var(--color-accent-700)" : muted(52);
  const markTitle = !live
    ? "No repository connected — nothing leaves this device. Click to connect one."
    : sync === "error"
      ? (error ?? `Something did not reach ${cfg?.owner}/${cfg?.repo}`)
      : `${cfg?.owner}/${cfg?.repo} — click to change it`;

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
      <div
        onClick={() => setOpen(true)}
        title={markTitle}
        /* The row aligns on the baseline, which puts a replaced element's
           bottom edge on it; the nudge drops the mark until its centre sits
           with the cap height of the words either side. */
        style={{ ...word, color: markColor, display: "flex", position: "relative", top: 3 }}
      >
        <GitHubMark />
      </div>
      {open && <ConnectDialog onClose={() => setOpen(false)} />}
    </>
  );
}
