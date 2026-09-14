import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "../lib/db";
import {
  keyMinus,
  localDayKey,
  longDate,
  longestStreak,
  shortDate,
  spellNumber,
  streakFrom,
  todayKey,
} from "../lib/dates";
import type { Progress } from "../lib/store";
import { isMark } from "../lib/types";
import BookPlate from "../components/BookPlate";

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;

const DAYS = 90;
const PIPS = 4;

export default function Dashboard() {
  const navigate = useNavigate();

  const books = useLiveQuery(() => db.books.toArray(), [], undefined);
  const entries = useLiveQuery(() => db.entries.toArray(), [], undefined);
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], undefined);
  const progress = useLiveQuery(async () => {
    const rows = await db.meta.toArray();
    const out: Record<string, Progress> = {};
    for (const r of rows) {
      if (r.key.startsWith("progress.")) out[r.key.slice(9)] = r.value as Progress;
    }
    return out;
  }, []);

  const model = useMemo(() => {
    const bs = books ?? [];
    const es = entries ?? [];
    const ss = sessions ?? [];
    const prog = progress ?? {};

    /* The streak and the recent list are about writing, and a mark is not
       writing — counting it would let a day of colouring passages stand in
       for a day of thinking. */
    const written = es.filter((e) => !isMark(e.kind));

    const dayKeys = new Set(written.map((e) => localDayKey(e.createdAt)));
    const streak = streakFrom(dayKeys);
    const longest = longestStreak(dayKeys);

    /* Daily word totals, read off the counts denormalized at save time.
       No entry body is parsed here. */
    const byDay = new Map<string, number>();
    for (const e of es) {
      const k = localDayKey(e.createdAt);
      byDay.set(k, (byDay.get(k) ?? 0) + e.wordCount);
    }

    const today = todayKey();
    const days: { key: string; words: number }[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const key = keyMinus(today, i);
      days.push({ key, words: byDay.get(key) ?? 0 });
    }
    const peak = Math.max(1, ...days.map((d) => d.words));

    const bars = days.map((d, i) => ({
      h: `${d.words === 0 ? 0 : Math.max(4, Math.round((d.words / peak) * 100))}%`,
      d: `${i * 8}ms`,
      title: `${d.words} words · ${longDate(d.key)}`,
    }));

    const monthPrefix = new Date().toISOString().slice(0, 7);
    const monthWords = es
      .filter((e) => e.createdAt.slice(0, 7) === monthPrefix)
      .reduce((n, e) => n + e.wordCount, 0);

    const sessionsToday = ss.filter((s) => localDayKey(s.startedAt) === today).length;
    const focusMinutes = ss
      .filter((s) => localDayKey(s.startedAt) === today)
      .reduce((n, s) => n + s.minutes, 0);

    const reading = [...bs]
      .filter((b) => b.lastOpenedAt)
      .sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""))
      .slice(0, 3)
      .map((b) => {
        const p = prog[b.id];
        const pages = p?.pageCount ?? b.pageCount ?? 0;
        const page = p?.page ?? 1;
        return {
          book: b,
          pct: pages ? `${Math.min(100, Math.round((page / pages) * 100))}%` : "0%",
          progress: pages ? `page ${page} of ${pages}` : "not opened yet",
        };
      });

    const recent = [...written]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map((e) => ({
        id: e.id,
        heading: e.title || "Untitled",
        book: bs.find((b) => b.id === e.bookId)?.title ?? "",
        date: shortDate(e.createdAt),
        bookId: e.bookId,
      }));

    return {
      empty: bs.length === 0 && es.length === 0,
      streak,
      longest,
      bars,
      monthWords,
      sessionsToday,
      focusMinutes,
      reading,
      recent,
      firstDay: longDate(days[0].key),
      lastDay: longDate(days[days.length - 1].key),
    };
  }, [books, entries, sessions, progress]);

  return (
    <main style={{ flex: 1, overflow: "auto" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "54px 30px 90px" }}>
        {model.empty ? (
          <div style={{ maxWidth: 470, paddingTop: 56 }}>
            <h1 style={{ fontWeight: 400, fontSize: 44, lineHeight: 1.1, marginBottom: 16 }}>
              Nothing on the shelf yet.
            </h1>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.75,
                color: muted(65),
                marginBottom: 26,
              }}
            >
              Add a book and the streak, the graph and the entries will follow.
            </p>
            <button className="btn btn-primary" onClick={() => navigate("/library")}>
              Add your first book
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 44, marginBottom: 68 }}>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: muted(50),
                    marginBottom: 8,
                  }}
                >
                  Streak
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 400,
                    fontSize: 104,
                    lineHeight: 0.86,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {model.streak}
                </div>
              </div>
              <div
                style={{
                  paddingBottom: 12,
                  fontSize: 14,
                  lineHeight: 1.65,
                  color: muted(58),
                  maxWidth: 190,
                }}
              >
                consecutive days with at least one entry. Longest so far,{" "}
                {spellNumber(model.longest)}.
              </div>
              <div style={{ paddingBottom: 14, marginLeft: "auto", textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: muted(50),
                    marginBottom: 8,
                  }}
                >
                  Focus sessions today
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    justifyContent: "flex-end",
                  }}
                >
                  {Array.from({ length: PIPS }, (_, i) => (
                    <div
                      key={i}
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: "50%",
                        border: "1px solid var(--color-accent)",
                        background:
                          model.sessionsToday > i ? "var(--color-accent)" : "transparent",
                      }}
                    />
                  ))}
                  <div
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: 26,
                      lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                      marginLeft: 4,
                    }}
                  >
                    {model.sessionsToday}
                  </div>
                </div>
                <div style={{ fontSize: 12, marginTop: 8, color: muted(55) }}>
                  {model.focusMinutes} minutes read
                </div>
              </div>
            </div>

            <section style={{ marginBottom: 66 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  borderBottom: "1px solid var(--color-divider)",
                  paddingBottom: 8,
                  marginBottom: 22,
                }}
              >
                <h2 style={{ fontWeight: 400, fontSize: 22, margin: 0 }}>Words journaled</h2>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: muted(45),
                  }}
                >
                  Last 90 days
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 140 }}>
                {model.bars.map((bar, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: "100%",
                      display: "flex",
                      alignItems: "flex-end",
                    }}
                  >
                    <div
                      className="bar"
                      title={bar.title}
                      style={{
                        width: "100%",
                        background: "var(--color-accent-300)",
                        borderTop: "1px solid var(--color-accent-600)",
                        height: bar.h,
                        animationDelay: bar.d,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 8,
                  fontSize: 11,
                  fontVariantNumeric: "tabular-nums",
                  color: muted(45),
                }}
              >
                <div>{model.firstDay}</div>
                <div>{model.monthWords.toLocaleString("en-GB")} words this month</div>
                <div>{model.lastDay}</div>
              </div>
            </section>

            <section style={{ marginBottom: 66 }}>
              <div
                style={{
                  borderBottom: "1px solid var(--color-divider)",
                  paddingBottom: 8,
                  marginBottom: 26,
                }}
              >
                <h2 style={{ fontWeight: 400, fontSize: 22, margin: 0 }}>Currently reading</h2>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 30,
                }}
              >
                {model.reading.map((r) => (
                  <div
                    key={r.book.id}
                    onClick={() => navigate(`/book/${r.book.id}`)}
                    className="lift"
                    style={{ display: "flex", gap: 16, cursor: "pointer" }}
                  >
                    <BookPlate
                      book={r.book}
                      style={{
                        width: 74,
                        height: 110,
                        flex: "none",
                        padding: 9,
                        fontSize: 11,
                        lineHeight: 1.2,
                      }}
                    />
                    <div style={{ minWidth: 0, paddingTop: 3 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-heading)",
                          fontSize: 18,
                          lineHeight: 1.2,
                        }}
                      >
                        {r.book.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontStyle: "italic",
                          color: muted(55),
                          marginBottom: 14,
                        }}
                      >
                        {r.book.author}
                      </div>
                      <div
                        style={{
                          height: 2,
                          background: "var(--color-neutral-300)",
                          marginBottom: 7,
                        }}
                      >
                        <div
                          style={{ height: 2, background: "var(--color-accent)", width: r.pct }}
                        />
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          fontVariantNumeric: "tabular-nums",
                          color: muted(50),
                        }}
                      >
                        {r.progress}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div style={{ borderBottom: "1px solid var(--color-divider)", paddingBottom: 8 }}>
                <h2 style={{ fontWeight: 400, fontSize: 22, margin: 0 }}>Recent entries</h2>
              </div>
              {model.recent.map((e) => (
                <div
                  key={e.id}
                  onClick={() => e.bookId && navigate(`/book/${e.bookId}`)}
                  className="row"
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 20,
                    padding: "15px 0",
                    borderBottom: "1px solid var(--color-divider)",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: 17,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {e.heading}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontStyle: "italic",
                      color: muted(58),
                      width: 190,
                    }}
                  >
                    {e.book}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontVariantNumeric: "tabular-nums",
                      color: muted(45),
                      width: 90,
                      textAlign: "right",
                    }}
                  >
                    {e.date}
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
