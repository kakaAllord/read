import { useEffect, useState } from "react";

import ConnectDialog from "./ConnectDialog";
import { config, connected, onConnectionChange } from "../lib/github/config";
import { onSyncChange, syncState, type SyncState } from "../lib/sync";

/* The one control the mockup does not draw but the app cannot do without:
   which repository this is writing to, and whether the last write landed. It
   is set in the header's own type — 12px, uppercase, tracked — so it reads as
   another word in that row rather than as a widget bolted onto it. */

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;

export default function RepoStatus() {
  const [live, setLive] = useState(connected());
  const [sync, setSync] = useState<SyncState>(syncState().state);
  const [error, setError] = useState<string | null>(syncState().error);
  const [open, setOpen] = useState(false);

  useEffect(() => onConnectionChange(setLive), []);
  useEffect(
    () =>
      onSyncChange((s, e) => {
        setSync(s);
        setError(e);
      }),
    [],
  );

  const cfg = config();
  const label = !live
    ? "Local only"
    : sync === "syncing"
      ? "Saving"
      : sync === "error"
        ? "Not saved"
        : (cfg?.repo ?? "Repo");

  const color = !live
    ? muted(38)
    : sync === "error"
      ? "var(--color-accent-700)"
      : muted(45);

  const title = !live
    ? "Nothing leaves this device. Click to connect a repository."
    : (error ?? `Saving to ${cfg?.owner}/${cfg?.repo} — click to change it`);

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        title={title}
        className={sync === "syncing" ? "spin" : undefined}
        style={{
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: "pointer",
          color,
        }}
      >
        {label}
      </div>
      {open && <ConnectDialog onClose={() => setOpen(false)} />}
    </>
  );
}
