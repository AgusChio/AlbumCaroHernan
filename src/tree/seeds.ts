import { LEAF, type Tree } from "./geometry";

export const TREE_TIME_ZONE = "America/Argentina/Buenos_Aires";

/** One curated seed per weekday, Sunday first; Saturday (the wedding day) gets the fullest crown. Picked with `npm run curate 1500`. */
export const CURATED_SEEDS: readonly number[] = [90, 1331, 1475, 989, 218, 242, 837];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekdayIn(date: Date, timeZone = TREE_TIME_ZONE): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return WEEKDAYS.indexOf(name);
}

export function seedForDay(date: Date, timeZone = TREE_TIME_ZONE): number {
  return CURATED_SEEDS[weekdayIn(date, timeZone)];
}

/**
 * Height / width of each curated tree as phones draw it (wide shape, detail 0.8), rounded up.
 * Lets the phone hero take its final height before the tree exists (no layout shift).
 * Regenerate with `npx tsx scripts/aspect.ts <seeds>`; a test keeps it in sync.
 */
export const PHONE_ASPECT: Readonly<Record<number, number>> = {
  90: 1.18, 1331: 1.04, 1475: 0.94, 989: 0.9, 218: 1.06, 242: 1.23, 837: 1.12,
};
export const DEFAULT_PHONE_ASPECT = 1.1;

export function phoneAspect(seed: number): number {
  return PHONE_ASPECT[seed] ?? DEFAULT_PHONE_ASPECT;
}

// ── curation guards ─────────────────────────────────────────────────────────

export const GUARDS = {
  maxBoundsAsymmetry: 0.12,
  minMassBalance: 0.72,
  minDome: 0.06,
  minSectorRatio: 0.35,
};

export interface SeedMetrics {
  /** |centre of bounds| / bounds width. */
  asymmetry: number;
  /** Leaf + blossom area on the lighter side / heavier side. */
  massBalance: number;
  /** (crown top in the centre − crown top at the shoulders) / height. */
  dome: number;
  /** Emptiest of 8 angular sectors / 4th emptiest, around the leaf centroid (crown-normalised). */
  sectorRatio: number;
}

export function seedMetrics(tree: Tree): SeedMetrics {
  const { bounds: b } = tree;
  const L = new Float32Array(tree.leaves.length + tree.blossoms.length);
  L.set(tree.leaves);
  L.set(tree.blossoms, tree.leaves.length);
  const width = b.maxX - b.minX;
  const height = b.maxY - Math.max(0, b.minY);
  const cx = (b.minX + b.maxX) / 2;
  const half = width / 2;

  let left = 0, right = 0, mx = 0, my = 0, total = 0;
  let centerTop = 0, shoulderL = 0, shoulderR = 0;
  for (let i = 0; i < L.length; i += LEAF) {
    const x = L[i], y = L[i + 1];
    const a = L[i + 2] * Math.abs(L[i + 3]);
    if (x < 0) left += a; else right += a;
    mx += x * a; my += y * a; total += a;
    const u = (x - cx) / half;
    if (Math.abs(u) < 0.15) centerTop = Math.max(centerTop, y);
    else if (u <= -0.5 && u >= -0.75) shoulderL = Math.max(shoulderL, y);
    else if (u >= 0.5 && u <= 0.75) shoulderR = Math.max(shoulderR, y);
  }
  mx /= total || 1;
  my /= total || 1;

  // Sectors are measured in crown-normalised space, so a wide crown isn't penalised for being wide.
  const env = tree.envelope;
  const sectors = new Float64Array(8);
  for (let i = 0; i < L.length; i += LEAF) {
    const dx = (L[i] - mx) / env.rx;
    const dy = (L[i + 1] - my) / (L[i + 1] >= my ? env.ryTop : env.ryBottom);
    const th = Math.atan2(dy, dx) + Math.PI;
    sectors[Math.min(7, Math.floor((th / (Math.PI * 2)) * 8))] += L[i + 2] * Math.abs(L[i + 3]);
  }
  const sorted = Array.from(sectors).sort((p, q) => p - q);

  return {
    asymmetry: Math.abs(cx) / width,
    massBalance: Math.min(left, right) / (Math.max(left, right) || 1),
    dome: (centerTop - Math.max(shoulderL, shoulderR)) / height,
    sectorRatio: sorted[0] / (sorted[3] || 1),
  };
}

export function passesGuards(m: SeedMetrics): boolean {
  return (
    m.asymmetry < GUARDS.maxBoundsAsymmetry &&
    m.massBalance > GUARDS.minMassBalance &&
    m.dome > GUARDS.minDome &&
    m.sectorRatio > GUARDS.minSectorRatio
  );
}
