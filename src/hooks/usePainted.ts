import { useEffect } from "react";
import { clear, paint, type PaintItem } from "../lib/paint";

/**
 * Keep the highlights on screen in step with what is on screen.
 *
 * The reader virtualises its pages and page mode rebuilds its text layer on
 * every render, so there is no single moment after which the text is settled.
 * Rather than guess at one, watch the scroll container and repaint on the
 * frame after it changes — a repaint is a search through the text of a
 * handful of cards, which is cheap, and doing it too often is better than
 * leaving a passage unmarked.
 */
export function usePainted(
  root: React.RefObject<HTMLElement | null>,
  items: PaintItem[],
  ready: boolean,
): void {
  useEffect(() => {
    const el = root.current;
    if (!el || !ready) return;

    let frame = 0;
    const repaint = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => paint(el, items));
    };

    repaint();
    const observer = new MutationObserver(repaint);
    observer.observe(el, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clear();
    };
  }, [root, items, ready]);
}
