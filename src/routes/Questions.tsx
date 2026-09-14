import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "../lib/db";
import { shortDate } from "../lib/dates";
import { setQuestionStatus } from "../lib/store";
import type { Entry } from "../lib/types";

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;

/* Everything you meant to go and find out, in one place.
 *
 * A question asked while reading is worth nothing if the only record of it is
 * a note in the middle of a book you have closed. What makes it worth asking
 * is being able to see, later and all at once, the list of things you decided
 * were worth knowing — so this is a list, sorted oldest first, because a
 * question you have been carrying for two months is the one to answer.
 *
 * Answered ones are not deleted. What you wanted to know is part of the
 * record of reading, and a list you can only add to is a list you stop
 * trusting. */

export default function Questions() {
  const navigate = useNavigate();
  const [showAnswered, setShowAnswered] = useState(false);

  const questions = useLiveQuery(
    () => db.entries.where("kind").equals("question").toArray(),
    [],
    undefined,
  );
  const books = useLiveQuery(() => db.books.toArray(), [], undefined);

  const titleOf = useMemo(() => {
    const map = new Map((books ?? []).map((b) => [b.id, b.title]));
    return (id?: string) => (id ? (map.get(id) ?? "a book no longer here") : "no book");
  }, [books]);

  const { open, answered } = useMemo(() => {
    const all = [...(questions ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      open: all.filter((q) => q.status !== "answered"),
      answered: all.filter((q) => q.status === "answered").reverse(),
    };
  }, [questions]);

  const shown = showAnswered ? answered : open;

  return (
    <main style={{ flex: 1, overflow: "auto" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "54px 30px 90px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            marginBottom: 10,
          }}
        >
          <h1 style={{ fontWeight: 400, fontSize: 44, margin: 0 }}>Questions</h1>
          <div style={{ display: "flex", gap: 18, paddingBottom: 8 }}>
            <div
              onClick={() => setShowAnswered(false)}
              style={{
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                color: showAnswered ? muted(50) : "var(--color-accent)",
              }}
            >
              Open · {open.length}
            </div>
            <div
              onClick={() => setShowAnswered(true)}
              style={{
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                color: showAnswered ? "var(--color-accent)" : muted(50),
              }}
            >
              Answered · {answered.length}
            </div>
          </div>
        </div>

        <p style={{ fontSize: 13.5, color: muted(55), margin: "0 0 44px", lineHeight: 1.7 }}>
          {showAnswered
            ? "What you went and found out."
            : "Things you decided were worth knowing, oldest first. Press Q on a passage while reading to add one."}
        </p>

        {shown.length === 0 && (
          <div
            style={{
              border: "1px dashed var(--color-accent-400)",
              borderRadius: "var(--radius-md)",
              padding: 34,
              textAlign: "center",
              color: muted(55),
              fontSize: 13.5,
            }}
          >
            {showAnswered
              ? "Nothing answered yet."
              : "No open questions. Select a passage while reading and press Q."}
          </div>
        )}

        {shown.map((q) => (
          <QuestionRow
            key={q.id}
            question={q}
            bookTitle={titleOf(q.bookId)}
            onOpenBook={() => q.bookId && navigate(`/book/${q.bookId}`)}
          />
        ))}
      </div>
    </main>
  );
}

function QuestionRow({
  question: q,
  bookTitle,
  onOpenBook,
}: {
  question: Entry;
  bookTitle: string;
  onOpenBook: () => void;
}) {
  const answered = q.status === "answered";

  return (
    <div
      style={{
        borderTop: "1px solid var(--color-divider)",
        padding: "24px 0",
        opacity: answered ? 0.62 : 1,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: 22,
          lineHeight: 1.35,
          marginBottom: q.body ? 10 : 14,
        }}
      >
        {q.title || "Untitled question"}
      </div>

      {q.body && (
        <div style={{ fontSize: 14.5, lineHeight: 1.75, color: muted(80), marginBottom: 14 }}>
          {q.body}
        </div>
      )}

      {q.excerpt && (
        <div
          style={{
            borderLeft: "2px solid var(--color-accent-2)",
            padding: "2px 0 2px 14px",
            fontSize: 13.5,
            fontStyle: "italic",
            lineHeight: 1.7,
            color: muted(65),
            marginBottom: 14,
          }}
        >
          {q.excerpt}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 11.5,
          letterSpacing: "0.06em",
          color: muted(45),
        }}
      >
        <span
          onClick={onOpenBook}
          style={{ cursor: q.bookId ? "pointer" : "default", textTransform: "uppercase" }}
        >
          {bookTitle}
          {q.displayLocation ? ` · ${q.displayLocation}` : ""}
        </span>
        <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
          {answered && q.answeredAt
            ? `asked ${shortDate(q.createdAt)}, answered ${shortDate(q.answeredAt)}`
            : `asked ${shortDate(q.createdAt)}`}
        </span>
        <span
          onClick={() => void setQuestionStatus(q.id, answered ? "open" : "answered")}
          style={{ cursor: "pointer", color: "var(--color-accent-700)" }}
        >
          {answered ? "Reopen" : "Mark answered"}
        </span>
      </div>
    </div>
  );
}
