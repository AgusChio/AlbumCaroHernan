import { useEffect, useRef, type RefObject } from "react";
import { treeSteps, type Tree } from "./geometry";
import { TreeRenderer } from "./renderer";
import { HERO_SHAPE, capDpr, detailFor, fitTree, heroFrame, readHeroLayout, readPalette } from "./layout";
import { seedForDay } from "./seeds";

interface TreeHeroProps {
  seed: number;
  paused?: boolean;
  navHeight?: number;
  ground?: number;
  /** Copy block the crown must keep clear of. */
  avoid?: RefObject<HTMLElement | null>;
}

type Deadline = { timeRemaining(): number };

/** Runs a generator one slice per idle callback while more than 4 ms remain. */
function runIdle<T>(gen: Generator<void, T, void>, done: (value: T) => void) {
  const hasIdle = typeof window.requestIdleCallback === "function";
  let handle = 0;
  let cancelled = false;
  const schedule = () => {
    if (hasIdle) {
      handle = window.requestIdleCallback(step, { timeout: 600 });
    } else {
      handle = window.setTimeout(() => {
        const start = performance.now();
        step({ timeRemaining: () => Math.max(0, 12 - (performance.now() - start)) });
      }, 16);
    }
  };
  const step = (deadline: Deadline) => {
    if (cancelled) return;
    let r = gen.next();
    while (!r.done && deadline.timeRemaining() > 4) r = gen.next();
    if (r.done) done(r.value);
    else schedule();
  };
  schedule();
  return () => {
    cancelled = true;
    if (hasIdle) window.cancelIdleCallback(handle);
    else window.clearTimeout(handle);
  };
}

/** Today's curated seed, or `?seed=N` for previews. */
export function pickTreeSeed(): number {
  const raw = new URLSearchParams(window.location.search).get("seed");
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : seedForDay(new Date());
}

export default function TreeHero({
  seed,
  paused = false,
  navHeight = 64,
  ground = 56,
  avoid,
}: TreeHeroProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const syncRef = useRef<() => void>(() => {});

  useEffect(() => {
    pausedRef.current = paused;
    syncRef.current();
  }, [paused]);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rootStyle = getComputedStyle(document.documentElement);
    const renderer = new TreeRenderer(
      inkRef.current!,
      liveRef.current!,
      readPalette((name) => rootStyle.getPropertyValue(name)),
      { breathing: !reduced },
    );
    let tree: Tree | null = null;
    let width = 0;
    let height = 0;
    let cancelBuild: (() => void) | null = null;
    let onScreen = true;
    let docVisible = !document.hidden;
    let elapsed = 0;
    let resumedAt: number | null = null;
    let raf = 0;
    let timer = 0;

    const now = () => elapsed + (resumedAt === null ? 0 : (performance.now() - resumedAt) / 1000);
    const shouldRun = () =>
      tree !== null && !reduced && onScreen && docVisible && !pausedRef.current;

    const stopLoop = () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      raf = 0;
      timer = 0;
    };

    const loop = () => {
      raf = 0;
      timer = 0;
      if (resumedAt === null) return;
      const t = now();
      renderer.frame(t);
      if (renderer.busy) {
        raf = requestAnimationFrame(loop);
      } else {
        const wait = renderer.nextEventAt() - t;
        if (Number.isFinite(wait)) timer = window.setTimeout(loop, Math.max(16, wait * 1000));
      }
    };

    const sync = () => {
      const run = shouldRun();
      if (run && resumedAt === null) {
        resumedAt = performance.now();
        stopLoop();
        raf = requestAnimationFrame(loop);
      } else if (!run && resumedAt !== null) {
        elapsed = now();
        resumedAt = null;
        stopLoop();
      }
    };
    syncRef.current = sync;

    // Reduced motion: the finished tree, drawn in a few budgeted frames, never animated.
    const drawStill = () => {
      raf = 0;
      if (!tree) return;
      renderer.frame(tree.duration);
      if (renderer.busy) raf = requestAnimationFrame(drawStill);
    };

    const place = () => {
      if (!tree || width === 0 || height === 0) return;
      const copy = avoid?.current?.getBoundingClientRect();
      const origin = wrap.getBoundingClientRect();
      const frame = heroFrame(width, height, {
        layout: readHeroLayout(wrap),
        navHeight,
        ground,
        copyRight: copy ? copy.right - origin.left : undefined,
        copyBottom: copy ? copy.bottom - origin.top : undefined,
      });
      const fit = fitTree({ ...frame, width, bounds: tree.bounds });
      renderer.resize(width, height, capDpr(window.devicePixelRatio), fit);
      if (reduced) {
        stopLoop();
        raf = requestAnimationFrame(drawStill);
      } else if (resumedAt !== null) {
        stopLoop();
        raf = requestAnimationFrame(loop);
      }
    };

    const build = () => {
      const gen = treeSteps({
        seed,
        shape: HERO_SHAPE,
        detail: detailFor(width, navigator.hardwareConcurrency),
      });
      cancelBuild = runIdle(gen, (built) => {
        cancelBuild = null;
        tree = built;
        renderer.setTree(built);
        place();
        sync();
      });
    };

    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      if (w === width && h === height) return;
      width = w;
      height = h;
      if (w === 0 || h === 0) return;
      if (!tree && !cancelBuild) build();
      else place();
    });

    let copySize = "";
    const copyObserver = new ResizeObserver(([entry]) => {
      const size = `${entry.contentRect.width}x${entry.contentRect.height}`;
      if (size === copySize) return;
      const first = copySize === "";
      copySize = size;
      if (!first) place();
    });

    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });

    const onVisibility = () => {
      docVisible = !document.hidden;
      sync();
    };

    // Start only after the first paint, so the tree never competes with LCP.
    let firstPaint = requestAnimationFrame(() => {
      firstPaint = 0;
      const rect = wrap.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      resizeObserver.observe(wrap);
      if (avoid?.current) copyObserver.observe(avoid.current);
      intersection.observe(wrap);
      document.addEventListener("visibilitychange", onVisibility);
      if (width > 0 && height > 0) build();
    });

    return () => {
      cancelAnimationFrame(firstPaint);
      cancelBuild?.();
      stopLoop();
      resizeObserver.disconnect();
      copyObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      syncRef.current = () => {};
    };
  }, [seed, navHeight, ground, avoid]);

  return (
    <div ref={wrapRef} className="tree-hero" aria-hidden="true">
      <canvas ref={inkRef} />
      <canvas ref={liveRef} />
    </div>
  );
}
