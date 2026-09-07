import { useCallback, useEffect, useRef, useState } from "react";
import { recordSession } from "../lib/store";

/* The focus session in the reader toolbar. Twenty-five minutes of work, five
   of break; the journal pane dims while the work half runs, and a completed
   work half is counted on the dashboard. */

export const WORK_SECONDS = 25 * 60;
export const BREAK_SECONDS = 5 * 60;

export type FocusMode = "idle" | "work" | "break";

export type Focus = {
  mode: FocusMode;
  running: boolean;
  left: number;
  toggle: () => void;
  reset: () => void;
};

export function useFocus(bookId: string): Focus {
  const [mode, setMode] = useState<FocusMode>("idle");
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(0);
  const book = useRef(bookId);
  book.current = bookId;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setLeft((prev) => {
        if (prev > 1) return prev - 1;
        setMode((m) => {
          if (m === "work") {
            void recordSession(book.current, WORK_SECONDS / 60);
            setLeft(BREAK_SECONDS);
            return "break";
          }
          setRunning(false);
          setLeft(0);
          return "idle";
        });
        return 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const toggle = useCallback(() => {
    setMode((m) => {
      if (m === "idle") {
        setLeft(WORK_SECONDS);
        setRunning(true);
        return "work";
      }
      setRunning((r) => !r);
      return m;
    });
  }, []);

  const reset = useCallback(() => {
    setMode("idle");
    setRunning(false);
    setLeft(0);
  }, []);

  return { mode, running, left, toggle, reset };
}

export function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}
