import type { Bounds, Shape } from "./geometry";
import type { Fit, Palette } from "./renderer";

export const SMALL_SCREEN = 640;
/** Stacked: fraction of the hero height reserved for the copy before it has been measured. */
export const STACKED_COPY_RESERVE = 0.26;
/** Stacked: the crown never gets wider than this, so tablets keep it in proportion with the copy. */
export const STACKED_MAX_CROWN = 560;
/** Side: trunk anchor as a fraction of the width, leaving air on the left for the copy. */
export const DESKTOP_ANCHOR = 0.6;
/** Side: the crown never reaches further left than this fraction of the width. */
export const DESKTOP_CLEAR_LEFT = 0.3;
export const SIDE_MARGIN = 16;
/** Air between the copy block and the crown. */
export const COPY_GAP = 32;
export const TOP_MARGIN = 20;

/**
 * Copy beside the tree, or copy above it. Decided by the media queries in styles.css,
 * which publish it as `--hero-layout` so CSS and canvas never disagree.
 */
export type HeroLayout = "side" | "stacked";

export function readHeroLayout(el: Element): HeroLayout {
  return getComputedStyle(el).getPropertyValue("--hero-layout").trim() === "stacked" ? "stacked" : "side";
}

/** A lapacho is an umbrella: the tall variant reads as a lopsided cone, so every screen gets the wide crown. */
export const HERO_SHAPE: Shape = "wide";

export function detailFor(width: number, hardwareConcurrency: number | undefined): number {
  return width < SMALL_SCREEN || (hardwareConcurrency ?? 8) <= 4 ? 0.8 : 1;
}

export function capDpr(dpr: number | undefined): number {
  return Math.min(2, Math.max(1, dpr || 1));
}

export interface HeroFrame {
  /** Highest CSS px the crown may reach. */
  top: number;
  /** Ground line in CSS px. */
  groundY: number;
  /** Trunk x in CSS px; undefined = centre the bounds. */
  anchorX?: number;
  /** Leftmost CSS px the crown may reach. */
  clearLeft?: number;
  /** Rightmost CSS px the crown may reach. */
  clearRight?: number;
}

export interface HeroFrameOptions {
  layout: HeroLayout;
  navHeight: number;
  ground: number;
  /** Side: right edge (CSS px) of the copy block the crown must never cover. */
  copyRight?: number;
  /** Stacked: bottom edge (CSS px) of the copy block above the tree. */
  copyBottom?: number;
}

export function heroFrame(width: number, height: number, o: HeroFrameOptions): HeroFrame {
  const groundY = height - o.ground;
  if (o.layout === "stacked") {
    const top = o.copyBottom === undefined
      ? o.navHeight + height * STACKED_COPY_RESERVE
      : o.copyBottom + COPY_GAP;
    const crown = Math.min(width - 2 * SIDE_MARGIN, STACKED_MAX_CROWN);
    return {
      top: Math.min(top, groundY - height * 0.3),
      groundY,
      clearLeft: (width - crown) / 2,
      clearRight: (width + crown) / 2,
    };
  }
  const anchor = width * DESKTOP_ANCHOR;
  if (o.copyRight === undefined) {
    return { top: o.navHeight + TOP_MARGIN, groundY, anchorX: anchor, clearLeft: width * DESKTOP_CLEAR_LEFT };
  }
  // A wide copy block pushes the trunk right, to the middle of the space that is left.
  const clearLeft = o.copyRight + COPY_GAP;
  return {
    top: o.navHeight + TOP_MARGIN,
    groundY,
    anchorX: Math.max(anchor, (clearLeft + width - SIDE_MARGIN) / 2),
    clearLeft,
  };
}

export interface FitInput extends HeroFrame {
  width: number;
  bounds: Bounds;
}

export function fitTree(i: FitInput): Fit {
  const { bounds: b } = i;
  const left = Math.max(SIDE_MARGIN, i.clearLeft ?? -Infinity);
  const right = Math.min(i.width - SIDE_MARGIN, i.clearRight ?? Infinity);
  const scaleH = Math.max(1, i.groundY - i.top) / Math.max(1e-6, b.maxY);

  if (i.anchorX !== undefined) {
    const sl = b.minX < 0 ? (i.anchorX - left) / -b.minX : Infinity;
    const sr = b.maxX > 0 ? (right - i.anchorX) / b.maxX : Infinity;
    const scale = Math.max(1, Math.min(scaleH, sl, sr));
    return { scale, originX: i.anchorX, groundY: i.groundY };
  }
  const scale = Math.max(1, Math.min(scaleH, (right - left) / (b.maxX - b.minX)));
  return { scale, originX: (left + right) / 2 - ((b.minX + b.maxX) / 2) * scale, groundY: i.groundY };
}

// ── palette ─────────────────────────────────────────────────────────────────

export type Rgb = [number, number, number];

export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

/** `amount` of `a` mixed into `b` (0.5 = halfway), in sRGB like CSS color-mix. */
export function mixColors(a: string, b: string, amount: number): string | null {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  const c = ca.map((v, k) => Math.round(v * amount + cb[k] * (1 - amount)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/**
 * Ink = primary mixed 50% with the text colour; paper = background; blossoms from the
 * blossom variables. Everything is read from CSS variables.
 */
export function readPalette(readVar: (name: string) => string): Palette {
  const primary = readVar("--color-primary");
  const text = readVar("--color-text");
  const bg = readVar("--color-bg");
  const blossom = readVar("--color-blossom").trim();
  const blossomDeep = readVar("--color-blossom-deep").trim();
  const ink = mixColors(primary, text, 0.5) ?? text.trim();
  return {
    ink,
    paper: bg.trim(),
    blossom: blossom || ink,
    blossomDeep: blossomDeep || mixColors(blossom, text, 0.7) || ink,
  };
}
