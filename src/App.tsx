import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "./lib/db";
import { localDayKey, streakFrom } from "./lib/dates";
import Dashboard from "./routes/Dashboard";
import Library from "./routes/Library";
import Questions from "./routes/Questions";
import Reader from "./routes/Reader";
import RepoStatus from "./components/RepoStatus";

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [ready, setReady] = useState(false);

  const entries = useLiveQuery(() => db.entries.toArray(), [], undefined);

  useEffect(() => {
    if (entries !== undefined) setReady(true);
  }, [entries]);

  /* A highlight is not a day's writing — it costs one keystroke and saying it
     kept a streak alive would make the streak worth nothing. */
  const streak = useMemo(() => {
    if (!entries) return 0;
    const written = entries.filter((e) => e.kind !== "highlight");
    return streakFrom(new Set(written.map((e) => localDayKey(e.createdAt))));
  }, [entries]);

  const openQuestions = useMemo(
    () => (entries ?? []).filter((e) => e.kind === "question" && e.status !== "answered").length,
    [entries],
  );

  const isDashboard = pathname === "/";
  const isLibrary = pathname.startsWith("/library");
  const isQuestions = pathname.startsWith("/questions");
  const streakLabel = streak === 0 ? "no entries yet" : `${streak} day streak`;

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        fontFamily: "var(--font-body)",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 26,
          padding: "14px 30px",
          borderBottom: "1px solid var(--color-divider)",
          flex: "none",
        }}
      >
        <div
          onClick={() => navigate("/")}
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: 21,
            letterSpacing: "0.03em",
            marginRight: "auto",
            cursor: "pointer",
            fontWeight: 400,
          }}
        >
          read
        </div>
        <div
          onClick={() => navigate("/")}
          style={{
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
            color: isDashboard ? "var(--color-accent)" : "var(--color-text)",
          }}
        >
          Dashboard
        </div>
        <div
          onClick={() => navigate("/library")}
          style={{
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
            color: isLibrary ? "var(--color-accent)" : "var(--color-text)",
          }}
        >
          Library
        </div>
        <div
          onClick={() => navigate("/questions")}
          style={{
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
            color: isQuestions ? "var(--color-accent)" : "var(--color-text)",
          }}
        >
          Questions{openQuestions > 0 ? ` ${openQuestions}` : ""}
        </div>
        <RepoStatus />
        <div
          style={{
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
            color: muted(45),
          }}
        >
          {streakLabel}
        </div>
      </header>

      {ready ? (
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/library" element={<Library />} />
          <Route path="/questions" element={<Questions />} />
          <Route path="/book/:bookId" element={<Reader />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      ) : (
        <main style={{ flex: 1 }} />
      )}
    </div>
  );
}
