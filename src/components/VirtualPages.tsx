import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

/* A book runs to a thousand pages and the reader is a continuous scroll, so
   only the pages near the viewport are in the DOM. Heights start as an
   estimate and are replaced by real measurements as pages render, which keeps
   the scrollbar honest once a stretch has been read through.

   Landing exactly on a page is a two-step affair: the first scroll uses the
   estimate, and once the real card is in the DOM its true position is used.
   That correction is attempt-capped, because a scroll that re-triggers its own
   correction is how a virtual list locks a tab up. */

const ESTIMATE = 980;
const OVERSCAN = 2;
const MAX_CORRECTIONS = 4;

type Props = {
  count: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Set to jump; the token makes a repeat jump to the same page take. */
  jumpTo: { index: number; token: number } | null;
  onVisible: (index: number) => void;
  children: (index: number) => ReactNode;
};

export default function VirtualPages({
  count,
  scrollRef,
  jumpTo,
  onVisible,
  children,
}: Props) {
  const heights = useRef<number[]>([]);
  const [version, setVersion] = useState(0);
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 1 + OVERSCAN) });
  const pending = useRef<{ index: number; tries: number } | null>(null);
  const lastReported = useRef(-1);
  const bumpFrame = useRef(0);

  if (heights.current.length !== count) {
    const next = new Array<number>(count).fill(ESTIMATE);
    for (let i = 0; i < Math.min(count, heights.current.length); i++) {
      next[i] = heights.current[i];
    }
    heights.current = next;
  }

  /* Prefix sums, rebuilt only when a measurement actually changed. */
  const offsets = useMemo(() => {
    const out = new Array<number>(count + 1);
    out[0] = 0;
    for (let i = 0; i < count; i++) out[i + 1] = out[i] + heights.current[i];
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, version]);

  const measure = useCallback((index: number, height: number) => {
    if (height <= 0) return;
    if (Math.abs(heights.current[index] - height) < 0.5) return;
    heights.current[index] = height;
    if (bumpFrame.current) return;
    bumpFrame.current = requestAnimationFrame(() => {
      bumpFrame.current = 0;
      setVersion((n) => n + 1);
    });
  }, []);

  useEffect(
    () => () => {
      if (bumpFrame.current) cancelAnimationFrame(bumpFrame.current);
    },
    [],
  );

  const recompute = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;
    const hs = heights.current;

    let start = 0;
    let acc = 0;
    while (start < count - 1 && acc + hs[start] <= top) {
      acc += hs[start];
      start++;
    }
    let end = start;
    let below = acc;
    while (end < count && below < bottom) {
      below += hs[end];
      end++;
    }

    const first = Math.max(0, start - OVERSCAN);
    const last = Math.min(count, end + OVERSCAN);
    setRange((r) => (r.start === first && r.end === last ? r : { start: first, end: last }));

    if (start !== lastReported.current) {
      lastReported.current = start;
      onVisible(start);
    }
  }, [count, onVisible, scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        recompute();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    recompute();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [recompute, scrollRef]);

  /* Step one of a jump: render the target and scroll to where it is estimated
     to be. */
  useEffect(() => {
    if (!jumpTo) return;
    const el = scrollRef.current;
    if (!el) return;
    pending.current = { index: jumpTo.index, tries: 0 };
    setRange({
      start: Math.max(0, jumpTo.index - OVERSCAN),
      end: Math.min(count, jumpTo.index + 1 + OVERSCAN),
    });
    el.scrollTop = offsets[jumpTo.index];
    lastReported.current = jumpTo.index;
    onVisible(jumpTo.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo]);

  /* Step two: once the card is really in the DOM, correct to its true top.
     Capped, so a correction that keeps missing gives up instead of looping. */
  useLayoutEffect(() => {
    const job = pending.current;
    if (!job) return;
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(`[data-vp-index="${job.index}"]`);
    if (!card) {
      pending.current = null;
      return;
    }
    const want = el.scrollTop + card.getBoundingClientRect().top - el.getBoundingClientRect().top;
    if (Math.abs(want - el.scrollTop) < 2 || job.tries >= MAX_CORRECTIONS) {
      pending.current = null;
      return;
    }
    job.tries++;
    el.scrollTop = want;
  }, [range, version, scrollRef]);

  const items: ReactNode[] = [];
  for (let i = range.start; i < range.end; i++) {
    items.push(
      <Measured key={i} index={i} onMeasure={measure}>
        {children(i)}
      </Measured>,
    );
  }

  return (
    <>
      <div style={{ height: offsets[range.start] }} />
      {items}
      <div style={{ height: Math.max(0, offsets[count] - offsets[range.end]) }} />
    </>
  );
}

function Measured({
  index,
  onMeasure,
  children,
}: {
  index: number;
  onMeasure: (index: number, height: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    onMeasure(index, el.getBoundingClientRect().height);
    const ro = new ResizeObserver(() => onMeasure(index, el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [index, onMeasure]);

  /* flow-root, so the page card's bottom margin is inside the measurement
     rather than collapsing out of it and leaving the offsets short. */
  return (
    <div ref={ref} data-vp-index={index} style={{ display: "flow-root" }}>
      {children}
    </div>
  );
}
