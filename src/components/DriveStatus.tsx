import { useEffect, useState } from "react";
import { driveConfigured, isSignedIn, onAuthChange, signIn, signOut } from "../lib/drive/auth";
import { onSyncChange, pullAll, syncState, writeLibrary, type SyncState } from "../lib/drive/sync";

/* The one control the mockup does not draw but the app cannot do without:
   the single Google sign-in. It is set in the header's own type — 12px,
   uppercase, tracked — so it reads as another word in that row rather than
   as a widget bolted onto it. */

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;

export default function DriveStatus() {
  const [signedIn, setSignedIn] = useState(isSignedIn());
  const [sync, setSync] = useState<SyncState>(syncState().state);
  const [error, setError] = useState<string | null>(syncState().error);
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthChange(setSignedIn), []);
  useEffect(
    () =>
      onSyncChange((s, e) => {
        setSync(s);
        setError(e);
      }),
    [],
  );

  if (!driveConfigured) {
    return (
      <div
        title="Set VITE_GOOGLE_CLIENT_ID in .env to sync to Drive. Everything works without it; nothing leaves this device."
        style={{
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: muted(38),
          cursor: "default",
        }}
      >
        Local only
      </div>
    );
  }

  const label = busy
    ? "…"
    : !signedIn
      ? "Sign in"
      : sync === "syncing"
        ? "Saving"
        : sync === "error"
          ? "Not saved"
          : "Drive";

  const color = !signedIn
    ? "var(--color-accent)"
    : sync === "error"
      ? "var(--color-accent-700)"
      : muted(45);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      if (!signedIn) {
        await signIn();
        await pullAll();
        await writeLibrary();
      } else {
        signOut();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={() => void onClick()}
      title={
        error ??
        (signedIn ? "Signed in to Google Drive — click to sign out" : "Sign in to Google Drive")
      }
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
  );
}
