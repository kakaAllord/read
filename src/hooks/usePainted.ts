import { useEffect } from "react";
import { clear, paint, type PaintItem } from "../lib/paint";

/* How long the page is given to stop changing before it is painted again.
   A pdf.js text layer arrives in a burst — the container is emptied, then its
   spans are appended as the stream renders — and a repaint in the middle of
   that finds half a page of text, matches nothing, and takes the marks off
   what was already correct. Waiting for the burst to settle is the difference
   between a highlight that sits still and one that blinks on every scroll. */
const SETTLE_MS = 120;

/**
 * Keep the highlights on screen in step with what is on screen.
 *
 * The reader virtualises its pages and page mode rebuilds its text layer on
 * every render, so there is no one moment after which the text is settled.
 * Rather than guess at one, watch the scroll container and repaint once it
 * has been quiet for a moment.
 */
export function usePainted(
  root: React.RefObject<HTMLElement | null>,
  items: PaintItem[],
  ready: boolean,
): void {
  useEffect(() => {
    const el = root.current;
    if (!el || !ready) return;

    let timer = 0;
    let frame = 0;

    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => paint(el, items));
    };

    const settle = () => {
      clearTimeout(timer);
      timer = window.setTimeout(run, SETTLE_MS);
    };

    /* What is already on screen is painted at once; only what changes after
       waits. Otherwise every scroll would start with a bare page. */
    run();

    /* Attributes are not watched: the virtualiser writes heights onto the
       cards as they render, and none of that moves a character. */
    const observer = new MutationObserver(settle);
    observer.observe(el, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      clear();
    };
  }, [root, items, ready]);
}
