/**
 * Engraved pink lapacho (Handroanthus impetiginosus) in bloom — pure geometry, no DOM.
 * Straight trunk that opens into ascending mother limbs; a rounded umbrella crown of
 * pink trumpet-flower clusters at the twig tips, with only a few green leaves.
 *
 * Tree space: trunk foot at (0, 0), +y is up, total height ≈ 1.
 * Every output array is flat, fixed-stride and sorted by its last column (t, seconds).
 *
 * RNG CALL ORDER — the order of calls IS the tree. Do not reorder, insert or remove calls
 * without re-curating the seeds (the seed guard tests will tell you).
 *   1. envelope lobes: 3 × (amplitude, phase)
 *   2. noise grid: NOISE_N² values, row-major
 *   3. trunk: height, lateral mother count, then per strand (left, right): lean, grow()
 *   4. mothers bottom-up: first side, then per mother: elevation gauss, length, alternation
 *      then two leaders (left, right): elevation, length
 *   5. limb stack, depth-first (children in order along the parent):
 *      grow() = bend gauss, first-child jitter, first side, then per step: wander gauss,
 *      and at each spawn: alternation, next interval;
 *      after grow(): per spawn: length jitter, spread gauss
 *   6. wood, depth-first from the left strand: per limb knot phase, per segment bark dots,
 *      then grain lines; then roots
 *   7. foliage, limbs in creation order: clusters → sprigs → blossoms and leaves
 */

export type Shape = "wide" | "tall";

export interface TreeOptions {
  seed: number;
  shape: Shape;
  /** 0..1. Lower detail = longer minimum limb, fewer foliage anchors. */
  detail: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Envelope {
  cy: number;
  rx: number;
  ryTop: number;
  ryBottom: number;
}

/** A sprig held back for the "breathing" phase. Its `t` columns are relative, 0..1. */
export interface LateSprig {
  x: number;
  y: number;
  ribs: Float32Array;
  leaves: Float32Array;
  blossoms: Float32Array;
}

export interface Tree {
  seed: number;
  shape: Shape;
  detail: number;
  envelope: Envelope;
  /** SEG stride: x0, y0, x1, y1, width, t */
  branches: Float32Array;
  /** SEG stride, drawn in paper colour */
  grain: Float32Array;
  /** DOT stride: x, y, r, t — paper colour */
  barkDots: Float32Array;
  /** RIB stride: x, y, len, bend, rot, t */
  ribs: Float32Array;
  /** LEAF stride: x, y, rx, ry, rot, t — ry < 0 marks an open (outline-only) leaf */
  leaves: Float32Array;
  /** LEAF stride, drawn in the blossom inks — ry < 0 marks an open (outline-only) flower */
  blossoms: Float32Array;
  late: LateSprig[];
  /** LEAF stride, lower crown blossoms that may fall */
  fallSources: Float32Array;
  bounds: Bounds;
  duration: number;
}

export const SEG = 6;
export const DOT = 4;
export const LEAF = 6;
export const RIB = 6;

// ── tunables ────────────────────────────────────────────────────────────────

export const ENVELOPES: Record<Shape, Envelope> = {
  wide: { cy: 0.67, rx: 0.6, ryTop: 0.31, ryBottom: 0.23 },
  tall: { cy: 0.69, rx: 0.42, ryTop: 0.29, ryBottom: 0.25 },
};
const LOBE_AMP = [0.05, 0.04, 0.03];
/** Lowers the crown shoulders so the centre reads as a dome. */
const DOME = 0.4;

const TRUNK_HEIGHT: Record<Shape, number> = { wide: 0.36, tall: 0.34 };
const TRUNK_LEAN = 0.018;
export const TRUNK_W = 0.07;
const LATERAL_MOTHERS_MIN = 2;
const LATERAL_MOTHERS_EXTRA = 2;
/** Elevation (rad) of the lowest and highest lateral mother limb: lapachos branch upward. */
const MOTHER_ELEV_LOW = 0.7;
const MOTHER_ELEV_HIGH = 1.15;
const SIDE_ALTERNATION = 0.82;

const STEP = 0.012;
const BEND = [0.012, 0.014, 0.018, 0.022, 0.025, 0.028, 0.03];
const WANDER = [0.05, 0.05, 0.045, 0.042, 0.04, 0.036, 0.034];
const WANDER_DAMP = 0.82;
const TWIST = 1.4;
/** Lapacho trunks are straight: the two strands barely wander, so they read as one bole. */
const TRUNK_TWIST = 0;
const STEER = [0.03, 0.04, 0.055, 0.065, 0.075, 0.085, 0.09];
const MAX_DEV = [0.45, 0.7, 0.8, 0.9, 0.95, 1.0, 1.0];
const LIFT = 0.1;
const OUTSIDE_SLACK = 0.4;
const OUTSIDE_WIDTH = 0.95;
const DROOP = 0.06;
const FLOOR = 0.09;
const MAX_DEPTH = 6;
const CHILD_SPREAD = [0.8, 0.75, 0.7, 0.65, 0.6, 0.58, 0.55];
const CHILD_UP = 0.3;
const CHILD_INTERVAL = 0.26;
const MIN_LEN_LOW = 0.075;
const MIN_LEN_HIGH = 0.034;

const PIPE_EXP = 0.55;
export const HAIR = 0.0012;
const TAPER_STEPS = 6;
const FLARE = 0.9;
const FLARE_DECAY = 0.04;
const KNOT_W = 0.014;
const KNOT_AMP = 0.09;
const KNOT_FREQ = 55;

const WOOD_START = 0;
const WOOD_SPAN = 4.6;
const FOLIAGE_START = 0.9;
const FOLIAGE_SPAN = 5.0;
const TIME_EXP = 0.8;

const LIGHT_X = -0.6;
const LIGHT_Y = 0.8;
const DOT_MIN_W = 0.009;
const DOT_DENSITY = 2600;
const DOT_R = 0.0017;
const GRAIN_MIN_W = 0.012;

const NOISE_N = 6;
/** Blend of the noise field with its mirror image: evens out left/right foliage mass. */
const NOISE_MIRROR = 0.4;
const AIR = 0.14;
const MID = 0.34;
const HIGH = 0.56;
const ANCHOR_GAP = 0.034;
const ANCHOR_DEPTH = 2;

const LEAF_LEN = 0.017;
const LEAF_ASPECT = 0.32;
const LEAF_ANGLE = 0.6;
const OPEN_LEAF = 0.45;
/** Share of rib positions that carry a green leaf (the rest of the sprig is flowers). */
const LEAF_CHANCE = 0.3;
const FLOWERS_MIN = 8;
const FLOWERS_EXTRA = 6;
const FLOWER_LEN = 0.0118;
const FLOWER_ASPECT = 0.5;
const FLOWER_SPREAD = 1.5;
const OPEN_FLOWER = 0.3;
const SPRIG_LEN = 0.04;
export const SPRIG_TIME = 0.4;
const LATE_FRACTION = 0.12;
const LATE_EDGE = 0.8;
const FALL_FRACTION = 0.12;
const FALL_MAX = 400;

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

/** Seconds a segment of width `w` takes to swell to its final width. Heavy wood is slower. */
export function swellLag(w: number): number {
  return 0.3 + 1.5 * Math.sqrt(Math.min(1, w / TRUNK_W));
}

// ── helpers ─────────────────────────────────────────────────────────────────

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller. Always consumes exactly two draws. */
export function gauss(rng: Rng): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

/** Signed shortest arc from 0 to `a`, in (-π, π]. */
function arc(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number) {
  return a + arc(b - a) * t;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Point on a sprig rib (quadratic Bézier) at u ∈ [0, 1]. Shared with the renderer. */
export function ribPoint(
  x: number, y: number, len: number, bend: number, rot: number, u: number,
): [number, number, number] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const mx = x + (c * len) / 2 - s * bend * len;
  const my = y + (s * len) / 2 + c * bend * len;
  const ex = x + c * len;
  const ey = y + s * len;
  const v = 1 - u;
  const px = v * v * x + 2 * v * u * mx + u * u * ex;
  const py = v * v * y + 2 * v * u * my + u * u * ey;
  const tx = 2 * v * (mx - x) + 2 * u * (ex - mx);
  const ty = 2 * v * (my - y) + 2 * u * (ey - my);
  return [px, py, Math.atan2(ty, tx)];
}

class Buf {
  data: Float32Array;
  len = 0;
  constructor(cap = 4096) {
    this.data = new Float32Array(cap);
  }
  private grow(n: number) {
    if (this.len + n <= this.data.length) return;
    const next = new Float32Array(Math.max(this.data.length * 2, this.len + n));
    next.set(this.data);
    this.data = next;
  }
  push4(a: number, b: number, c: number, d: number) {
    this.grow(4);
    const o = this.len;
    const D = this.data;
    D[o] = a; D[o + 1] = b; D[o + 2] = c; D[o + 3] = d;
    this.len += 4;
  }
  push6(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.grow(6);
    const o = this.len;
    const D = this.data;
    D[o] = a; D[o + 1] = b; D[o + 2] = c; D[o + 3] = d; D[o + 4] = e; D[o + 5] = f;
    this.len += 6;
  }
  out() {
    return this.data.slice(0, this.len);
  }
}

/** Reorders rows of a flat array by its last column, through an index (stable). */
export function sortByTime(arr: Float32Array, stride: number): Float32Array {
  const n = arr.length / stride;
  const tc = stride - 1;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => arr[a * stride + tc] - arr[b * stride + tc] || a - b);
  const out = new Float32Array(arr.length);
  for (let i = 0; i < n; i++) {
    out.set(arr.subarray(idx[i] * stride, idx[i] * stride + stride), i * stride);
  }
  return out;
}

// ── generator state ─────────────────────────────────────────────────────────

interface Limb {
  xs: number[];
  ys: number[];
  depth: number;
  dist0: number;
  trunk: boolean;
  children: Limb[];
  at: number[];
  tips: number;
}

interface Task {
  parent: Limb;
  at: number;
  x: number;
  y: number;
  heading: number;
  target: number;
  depth: number;
  maxLen: number;
  dist0: number;
}

interface Spawn {
  at: number;
  heading: number;
  side: number;
}

interface Gen {
  rng: Rng;
  shape: Shape;
  env: Envelope;
  lobes: number[];
  noise: Float32Array;
  minLen: number;
  liftY: number;
  strands: Limb[];
  limbs: Limb[];
  stack: Task[];
  maxDist: number;
  branches: Buf;
  grain: Buf;
  dots: Buf;
  ribs: Buf;
  leaves: Buf;
  blossoms: Buf;
  fall: Buf;
  late: LateSprig[];
}

/** Normalised radius inside the lobed crown envelope: ≤ 1 means inside. */
export function envelopeRadius(env: Envelope, lobes: number[], x: number, y: number): number {
  const dx = x / env.rx;
  const top = env.ryTop * Math.max(0.4, 1 - DOME * dx * dx);
  const dy = (y - env.cy) / (y >= env.cy ? top : env.ryBottom);
  const th = Math.atan2(dy, dx);
  let lobe = 1;
  for (let k = 0; k < lobes.length; k += 2) {
    lobe += lobes[k] * Math.sin((k / 2 + 1) * th + lobes[k + 1]);
  }
  return Math.hypot(dx, dy) / lobe;
}

function noiseAt(g: Gen, x: number, y: number): number {
  return lerp(rawNoise(g, x, y), rawNoise(g, -x, y), NOISE_MIRROR);
}

function rawNoise(g: Gen, x: number, y: number): number {
  const { env } = g;
  const gx = clamp((x + env.rx) / (2 * env.rx), 0, 1) * (NOISE_N - 1);
  const gy = clamp((y - (env.cy - env.ryBottom)) / (env.ryTop + env.ryBottom), 0, 1) * (NOISE_N - 1);
  const i = Math.min(NOISE_N - 2, Math.floor(gx));
  const j = Math.min(NOISE_N - 2, Math.floor(gy));
  const fx = smooth(gx - i);
  const fy = smooth(gy - j);
  const N = g.noise;
  const a = lerp(N[j * NOISE_N + i], N[j * NOISE_N + i + 1], fx);
  const b = lerp(N[(j + 1) * NOISE_N + i], N[(j + 1) * NOISE_N + i + 1], fx);
  const v = lerp(a, b, fy);
  return smooth(clamp((v - 0.2) / 0.6, 0, 1));
}

function timeAt(g: Gen, dist: number, start: number, span: number) {
  return start + span * Math.pow(clamp(dist / g.maxDist, 0, 1), TIME_EXP);
}

function createGen(opts: TreeOptions): Gen {
  const rng = mulberry32(opts.seed);
  const env = ENVELOPES[opts.shape];
  const lobes: number[] = [];
  for (let k = 0; k < LOBE_AMP.length; k++) {
    lobes.push(LOBE_AMP[k] * (rng() * 2 - 1), rng() * TAU);
  }
  const noise = new Float32Array(NOISE_N * NOISE_N);
  for (let i = 0; i < noise.length; i++) noise[i] = rng();
  const detail = clamp(opts.detail, 0, 1);
  return {
    rng,
    shape: opts.shape,
    env,
    lobes,
    noise,
    minLen: lerp(MIN_LEN_LOW, MIN_LEN_HIGH, detail),
    liftY: env.cy - env.ryBottom,
    strands: [],
    limbs: [],
    stack: [],
    maxDist: 1,
    branches: new Buf(),
    grain: new Buf(),
    dots: new Buf(),
    ribs: new Buf(),
    leaves: new Buf(),
    blossoms: new Buf(),
    fall: new Buf(1024),
    late: [],
  };
}

// ── structure ───────────────────────────────────────────────────────────────

function grow(
  g: Gen, x: number, y: number, heading: number, target: number,
  depth: number, maxLen: number, dist0: number, trunk: boolean,
): { limb: Limb; spawns: Spawn[] } {
  const { rng } = g;
  const d = Math.min(depth, MAX_DEPTH);
  const limb: Limb = { xs: [x], ys: [y], depth, dist0, trunk, children: [], at: [], tips: 1 };
  const base = heading;
  const bend = gauss(rng) * BEND[d];
  const twist = trunk ? TRUNK_TWIST : d <= 1 ? TWIST : 1;
  const canBranch = !trunk && depth < MAX_DEPTH;
  const interval = Math.max(0.022, maxLen * CHILD_INTERVAL);
  let nextChild = maxLen * 0.16 + interval * rng();
  let side = rng() < 0.5 ? -1 : 1;
  let closest = envelopeRadius(g.env, g.lobes, x, y);
  let entered = closest <= 1;
  let w = 0;
  let len = 0;
  const spawns: Spawn[] = [];
  const steps = Math.ceil(maxLen / STEP);

  for (let i = 0; i < steps; i++) {
    w = w * WANDER_DAMP + gauss(rng) * WANDER[d] * twist;
    heading += bend + w;
    heading += arc(target - heading) * STEER[d];
    if (!trunk) {
      if (depth <= 2 && y < g.liftY) heading += arc(HALF_PI - heading) * LIFT * (1.3 - y / g.liftY);
      if (depth >= 4 && len > maxLen * 0.6) heading += arc(-HALF_PI - heading) * DROOP;
      if (y < FLOOR && Math.sin(heading) < 0.25) heading += arc(HALF_PI - heading) * 0.35;
    }
    const dev = arc(heading - base);
    if (dev > MAX_DEV[d]) heading = base + MAX_DEV[d];
    else if (dev < -MAX_DEV[d]) heading = base - MAX_DEV[d];

    x += Math.cos(heading) * STEP;
    y += Math.sin(heading) * STEP;
    len += STEP;
    limb.xs.push(x);
    limb.ys.push(y);

    if (!trunk) {
      const r = envelopeRadius(g.env, g.lobes, x, y);
      if (r <= 1) entered = true;
      else if (entered || r > closest + OUTSIDE_SLACK || Math.abs(x) > g.env.rx * OUTSIDE_WIDTH) break;
      closest = Math.min(closest, r);
      if (y < FLOOR * 0.4) break;
    }
    if (canBranch && len >= nextChild && len < maxLen - STEP * 2) {
      spawns.push({ at: limb.xs.length - 1, heading, side });
      if (rng() < SIDE_ALTERNATION) side = -side;
      nextChild += interval * (0.7 + 0.6 * rng());
    }
  }
  g.limbs.push(limb);
  return { limb, spawns };
}

function buildTrunk(g: Gen) {
  const { rng, shape } = g;
  const trunkH = TRUNK_HEIGHT[shape] * (0.9 + 0.2 * rng());
  const lateral = LATERAL_MOTHERS_MIN + Math.floor(rng() * (LATERAL_MOTHERS_EXTRA + 1));

  for (const s of [-1, 1]) {
    const lean = TRUNK_LEAN * (0.7 + 0.6 * rng());
    const h = HALF_PI - s * lean;
    const { limb } = grow(g, s * 0.004, 0, h, h, 0, trunkH, 0, true);
    g.strands.push(limb);
  }

  const tasks: Task[] = [];
  const motherOn = (side: number, at: number, heading: number, maxLen: number) => {
    const strand = side < 0 ? g.strands[0] : g.strands[1];
    const i = Math.min(strand.xs.length - 1, at < 0 ? strand.xs.length - 1 : at);
    tasks.push({
      parent: strand, at: i, x: strand.xs[i], y: strand.ys[i], heading,
      target: lerpAngle(heading, HALF_PI, 0.3), depth: 1, maxLen, dist0: i * STEP,
    });
  };

  let side = rng() < 0.5 ? -1 : 1;
  let balance = 0;
  const tallK = shape === "tall" ? 0.82 : 1;
  for (let k = 0; k < lateral; k++) {
    if (Math.abs(balance + side) > 1) side = -side;
    balance += side;
    const s = lateral === 1 ? 0 : k / (lateral - 1);
    const u = 1 - Math.pow(1 - s, 1.7);
    const strand = side < 0 ? g.strands[0] : g.strands[1];
    const at = Math.round((0.72 + 0.28 * u) * (strand.xs.length - 1));
    const elev = lerp(MOTHER_ELEV_LOW, MOTHER_ELEV_HIGH, s) + gauss(rng) * 0.1;
    const maxLen = lerp(0.6, 0.5, s) * (0.85 + 0.3 * rng()) * tallK;
    motherOn(side, at, side > 0 ? elev : Math.PI - elev, maxLen);
    if (rng() < SIDE_ALTERNATION) side = -side;
  }
  for (const s of [-1, 1]) {
    const elev = 1.28 + 0.14 * rng();
    const maxLen = 0.58 * (0.85 + 0.3 * rng());
    motherOn(s, -1, s > 0 ? elev : Math.PI - elev, maxLen);
  }
  tasks.sort((a, b) => a.y - b.y);
  for (let i = tasks.length - 1; i >= 0; i--) g.stack.push(tasks[i]);
}

function processTask(g: Gen, task: Task) {
  const { rng } = g;
  const { limb, spawns } = grow(
    g, task.x, task.y, task.heading, task.target, task.depth, task.maxLen, task.dist0, false,
  );
  task.parent.children.push(limb);
  task.parent.at.push(task.at);

  const d = Math.min(task.depth, MAX_DEPTH);
  const len = (limb.xs.length - 1) * STEP;
  const children: Task[] = [];
  for (const s of spawns) {
    const spawnLen = s.at * STEP;
    const remaining = len - spawnLen;
    const childLen = (remaining * 0.6 + task.maxLen * 0.2) * (0.75 + 0.5 * rng());
    const spread = CHILD_SPREAD[d] + gauss(rng) * 0.12;
    if (childLen < g.minLen || remaining <= STEP) continue;
    const h = s.heading + s.side * spread;
    children.push({
      parent: limb, at: s.at, x: limb.xs[s.at], y: limb.ys[s.at], heading: h,
      target: lerpAngle(h, HALF_PI, CHILD_UP), depth: task.depth + 1, maxLen: childLen,
      dist0: task.dist0 + spawnLen,
    });
  }
  for (let i = children.length - 1; i >= 0; i--) g.stack.push(children[i]);
}

/** Children were attached in DFS order, so `at` may be unsorted across siblings. */
function finishStructure(g: Gen) {
  let maxDist = 0;
  const visit = (l: Limb): number => {
    const order = l.at.map((_, i) => i).sort((a, b) => l.at[a] - l.at[b]);
    l.children = order.map((i) => l.children[i]);
    l.at = order.map((i) => l.at[i]);
    let tips = 1;
    for (const c of l.children) tips += visit(c);
    l.tips = tips;
    maxDist = Math.max(maxDist, l.dist0 + (l.xs.length - 1) * STEP);
    return tips;
  };
  for (const s of g.strands) visit(s);
  g.maxDist = maxDist;
}

// ── wood ────────────────────────────────────────────────────────────────────

function emitLimb(g: Gen, limb: Limb, w0: number) {
  const { rng } = g;
  const n = limb.xs.length - 1;
  if (n <= 0) return;
  const { xs, ys } = limb;

  const support = new Float64Array(n);
  let acc = 1;
  let ci = limb.children.length - 1;
  for (let j = n - 1; j >= 0; j--) {
    while (ci >= 0 && limb.at[ci] > j) acc += limb.children[ci--].tips;
    support[j] = acc;
  }

  const phase = rng() * TAU;
  const widths = new Float64Array(n);
  const times = new Float64Array(n);
  let maxW = 0;

  for (let j = 0; j < n; j++) {
    const dist = limb.dist0 + j * STEP;
    let w = w0 * Math.pow(support[j], PIPE_EXP);
    if (!limb.trunk) {
      const rem = n - j;
      if (rem < TAPER_STEPS) w = HAIR + (w - HAIR) * Math.pow(rem / TAPER_STEPS, 0.8);
    } else {
      w *= 1 + FLARE * Math.exp(-((ys[j] + ys[j + 1]) / 2) / FLARE_DECAY);
    }
    if (w > KNOT_W) w *= 1 + KNOT_AMP * Math.sin(dist * KNOT_FREQ + phase);
    w = Math.max(w, HAIR);
    const t = timeAt(g, dist, WOOD_START, WOOD_SPAN);
    widths[j] = w;
    times[j] = t;
    maxW = Math.max(maxW, w);
    g.branches.push6(xs[j], ys[j], xs[j + 1], ys[j + 1], w, t);

    if (w > DOT_MIN_W) {
      const dx = xs[j + 1] - xs[j];
      const dy = ys[j + 1] - ys[j];
      const L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L;
      const ny = dx / L;
      const lit = nx * LIGHT_X + ny * LIGHT_Y >= 0 ? 1 : -1;
      const count = Math.floor(w * STEP * DOT_DENSITY + rng());
      const tDot = t + swellLag(w) + 0.02;
      for (let k = 0; k < count; k++) {
        const u = rng();
        const o = Math.max(0.05, 0.5 - Math.abs(gauss(rng)) * 0.2);
        const r = DOT_R * (0.6 + 0.8 * rng());
        g.dots.push4(xs[j] + dx * u + nx * lit * o * w, ys[j] + dy * u + ny * lit * o * w, r, tDot);
      }
    }
  }

  if (maxW > GRAIN_MIN_W) {
    const lines = clamp(Math.round(maxW / 0.007), 1, 6);
    for (let l = 0; l < lines; l++) {
      const j0 = Math.floor(rng() * n);
      const k = 4 + Math.floor(rng() * 9);
      let o = (rng() * 2 - 1) * 0.36;
      let px = NaN;
      let py = NaN;
      for (let j = j0; j < Math.min(n, j0 + k); j++) {
        if (widths[j] < GRAIN_MIN_W * 0.8) break;
        o = clamp(o + gauss(rng) * 0.05, -0.42, 0.42);
        const cut = rng() < 0.2;
        const dx = xs[j + 1] - xs[j];
        const dy = ys[j + 1] - ys[j];
        const L = Math.hypot(dx, dy) || 1;
        const qx = xs[j + 1] + (-dy / L) * o * widths[j];
        const qy = ys[j + 1] + (dx / L) * o * widths[j];
        if (!cut && !Number.isNaN(px)) {
          g.grain.push6(px, py, qx, qy, HAIR, times[j] + swellLag(widths[j]) + 0.05);
        }
        px = qx;
        py = qy;
      }
    }
  }
}

function emitRoots(g: Gen, baseW: number) {
  const { rng } = g;
  const count = 2 + (rng() < 0.5 ? 1 : 0);
  let side = rng() < 0.5 ? -1 : 1;
  for (let r = 0; r < count; r++) {
    const len = 0.05 + 0.05 * rng();
    let h = side > 0 ? -0.22 - 0.2 * rng() : Math.PI + 0.22 + 0.2 * rng();
    let x = side * (0.01 + 0.008 * rng());
    let y = 0.028;
    const step = STEP * 0.6;
    const steps = Math.ceil(len / step);
    for (let i = 0; i < steps; i++) {
      h += gauss(rng) * 0.06;
      const nx = x + Math.cos(h) * step;
      const ny = y + Math.sin(h) * step;
      const f = i / steps;
      const w = Math.max(HAIR, baseW * 0.5 * Math.pow(1 - f, 1.4));
      g.branches.push6(x, y, nx, ny, w, 0.05 + 0.6 * f);
      x = nx;
      y = ny;
    }
    side = r === 0 ? -side : rng() < 0.5 ? -1 : 1;
  }
}

// ── foliage ─────────────────────────────────────────────────────────────────

/** A lapacho twig: hairline rib, a few green leaves along it and a fan of trumpet flowers at the tip. */
function sprig(g: Gen, x: number, y: number, a: number, len: number, t0: number) {
  const { rng } = g;
  a = lerpAngle(a, HALF_PI, 0.15);
  const bend = gauss(rng) * 0.12;
  const tip = ribPoint(x, y, len, bend, a, 1);
  const edge = envelopeRadius(g.env, g.lobes, tip[0], tip[1]) > LATE_EDGE;
  const late = edge && rng() < LATE_FRACTION;
  const ribs = late ? new Buf(6) : g.ribs;
  const leaves = late ? new Buf(32) : g.leaves;
  const blossoms = late ? new Buf(96) : g.blossoms;
  const timeOf = (u: number) => (late ? u : t0 + u * SPRIG_TIME);
  ribs.push6(x, y, len, bend, a, late ? 0 : t0);

  const n = 2 + Math.floor(len / 0.012);
  for (let i = 0; i < n; i++) {
    if (rng() >= LEAF_CHANCE) continue;
    const u = 0.25 + (0.6 * (i + 0.5)) / n;
    const [px, py, tan] = ribPoint(x, y, len, bend, a, u);
    const la = tan + (i % 2 === 0 ? -1 : 1) * LEAF_ANGLE * (0.8 + 0.4 * rng());
    const rx = (LEAF_LEN * (0.75 + 0.5 * rng())) / 2;
    let ry = rx * LEAF_ASPECT;
    if (rng() < OPEN_LEAF) ry = -ry;
    leaves.push6(px + Math.cos(la) * rx * 0.95, py + Math.sin(la) * rx * 0.95, rx, ry, la, timeOf(u));
  }

  const [tx, ty, tan] = tip;
  const k = FLOWERS_MIN + Math.floor(rng() * (FLOWERS_EXTRA + 1));
  const fallY = g.env.cy - g.env.ryBottom * 0.15;
  for (let i = 0; i < k; i++) {
    const fa = tan + ((i + 0.6 * rng()) / k - 0.5) * 2 * FLOWER_SPREAD;
    const rx = (FLOWER_LEN * (0.75 + 0.5 * rng())) / 2;
    let ry = rx * FLOWER_ASPECT;
    if (rng() < OPEN_FLOWER) ry = -ry;
    const reach = rx * (0.6 + 0.6 * rng());
    const cx = tx + Math.cos(fa) * reach;
    const cy = ty + Math.sin(fa) * reach;
    const t = timeOf(0.7 + (0.3 * i) / k);
    blossoms.push6(cx, cy, rx, ry, fa, t);
    if (!late && cy < fallY && g.fall.len < FALL_MAX * LEAF && rng() < FALL_FRACTION) {
      g.fall.push6(cx, cy, rx, ry, fa, t);
    }
  }
  if (late) {
    g.late.push({ x, y, ribs: ribs.out(), leaves: leaves.out(), blossoms: blossoms.out() });
  }
}

function cluster(g: Gen, x: number, y: number, heading: number, dist: number) {
  const den = noiseAt(g, x, y);
  const { rng } = g;
  const t0 = timeAt(g, dist, FOLIAGE_START, FOLIAGE_SPAN);
  // A lapacho in bloom has no bare twigs: even the airiest tips carry one small fan.
  if (den < AIR) {
    sprig(g, x, y, heading + gauss(rng) * 0.3, SPRIG_LEN * (0.55 + 0.3 * rng()), t0);
    return;
  }

  if (den > HIGH) {
    const k = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < k; i++) {
      const a = heading + (i / (k - 1) - 0.5) * 2.6 + gauss(rng) * 0.15;
      sprig(g, x, y, a, SPRIG_LEN * (0.8 + 0.5 * rng()), t0 + i * 0.05);
    }
    const m = 7 + Math.floor(rng() * 4);
    for (let i = 0; i < m; i++) {
      const a = (i / m) * TAU + rng() * 0.4;
      const r = 0.006 + 0.004 * rng();
      const rx = LEAF_LEN * 0.38;
      g.leaves.push6(x + Math.cos(a) * r, y + Math.sin(a) * r, rx, rx * 0.42, a, t0 + 0.1);
    }
  } else if (den > MID) {
    const k = 2 + (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const a = heading + (i / (k - 1) - 0.5) * 1.1 + gauss(rng) * 0.12;
      sprig(g, x, y, a, SPRIG_LEN * (0.75 + 0.45 * rng()), t0 + i * 0.06);
    }
  } else {
    sprig(g, x, y, heading + gauss(rng) * 0.3, SPRIG_LEN * (0.7 + 0.4 * rng()), t0);
  }
}

function foliageForLimb(g: Gen, limb: Limb) {
  const n = limb.xs.length - 1;
  if (limb.depth < 1 || n < 1) return;
  const { xs, ys } = limb;
  const tipHeading = Math.atan2(ys[n] - ys[n - 1], xs[n] - xs[n - 1]);
  cluster(g, xs[n], ys[n], tipHeading, limb.dist0 + n * STEP);
  if (limb.depth >= ANCHOR_DEPTH) {
    const gap = Math.max(2, Math.round(ANCHOR_GAP / STEP));
    for (let j = Math.round(n * 0.3); j < n - 2; j += gap) {
      if (envelopeRadius(g.env, g.lobes, xs[j], ys[j]) > 1.05) continue;
      const h = Math.atan2(ys[j + 1] - ys[j], xs[j + 1] - xs[j]);
      cluster(g, xs[j], ys[j], h, limb.dist0 + j * STEP);
    }
  }
}

// ── bounds & duration ───────────────────────────────────────────────────────

function computeBounds(t: Omit<Tree, "bounds" | "duration">): Bounds {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const add = (x: number, y: number, r: number) => {
    if (x - r < minX) minX = x - r;
    if (x + r > maxX) maxX = x + r;
    if (y - r < minY) minY = y - r;
    if (y + r > maxY) maxY = y + r;
  };
  const B = t.branches;
  for (let i = 0; i < B.length; i += SEG) {
    add(B[i], B[i + 1], B[i + 4] / 2);
    add(B[i + 2], B[i + 3], B[i + 4] / 2);
  }
  const D = t.barkDots;
  for (let i = 0; i < D.length; i += DOT) add(D[i], D[i + 1], D[i + 2]);
  const leafSet = (L: Float32Array) => {
    for (let i = 0; i < L.length; i += LEAF) add(L[i], L[i + 1], L[i + 2]);
  };
  const ribSet = (R: Float32Array) => {
    for (let i = 0; i < R.length; i += RIB) {
      add(R[i], R[i + 1], 0);
      const [ex, ey] = ribPoint(R[i], R[i + 1], R[i + 2], R[i + 3], R[i + 4], 1);
      add(ex, ey, Math.abs(R[i + 3]) * R[i + 2]);
    }
  };
  leafSet(t.leaves);
  leafSet(t.blossoms);
  ribSet(t.ribs);
  for (const s of t.late) {
    leafSet(s.leaves);
    leafSet(s.blossoms);
    ribSet(s.ribs);
  }
  return { minX, maxX, minY, maxY };
}

function computeDuration(t: Omit<Tree, "bounds" | "duration">): number {
  let d = 0;
  const B = t.branches;
  for (let i = 0; i < B.length; i += SEG) d = Math.max(d, B[i + 5] + swellLag(B[i + 4]));
  const lastT = (a: Float32Array, extra = 0) => (a.length ? a[a.length - 1] + extra : 0);
  return Math.max(
    d, lastT(t.grain), lastT(t.barkDots), lastT(t.ribs, SPRIG_TIME), lastT(t.leaves), lastT(t.blossoms),
  );
}

// ── public API ──────────────────────────────────────────────────────────────

/** Sliced generation: yields between (and within) phases so a host can spread it over idle time. */
export function* treeSteps(opts: TreeOptions): Generator<void, Tree, void> {
  const g = createGen(opts);

  // structure
  buildTrunk(g);
  yield;
  let n = 0;
  while (g.stack.length) {
    processTask(g, g.stack.pop()!);
    if (++n % 150 === 0) yield;
  }
  finishStructure(g);
  yield;

  // wood
  const rootTips = g.strands[0].tips + g.strands[1].tips;
  const w0 = (TRUNK_W * 0.62) / Math.pow(rootTips / 2, PIPE_EXP);
  const stack: Limb[] = [g.strands[1], g.strands[0]];
  n = 0;
  while (stack.length) {
    const l = stack.pop()!;
    emitLimb(g, l, w0);
    for (let i = l.children.length - 1; i >= 0; i--) stack.push(l.children[i]);
    if (++n % 250 === 0) yield;
  }
  emitRoots(g, w0 * Math.pow(g.strands[0].tips, PIPE_EXP) * (1 + FLARE));
  yield;

  // foliage
  for (let i = 0; i < g.limbs.length; i++) {
    foliageForLimb(g, g.limbs[i]);
    if (i % 200 === 199) yield;
  }
  yield;

  // order
  const branches = sortByTime(g.branches.out(), SEG);
  const grain = sortByTime(g.grain.out(), SEG);
  yield;
  const barkDots = sortByTime(g.dots.out(), DOT);
  const ribs = sortByTime(g.ribs.out(), RIB);
  yield;
  const leaves = sortByTime(g.leaves.out(), LEAF);
  const blossoms = sortByTime(g.blossoms.out(), LEAF);
  const fallSources = g.fall.out();

  const partial = {
    seed: opts.seed, shape: opts.shape, detail: clamp(opts.detail, 0, 1), envelope: g.env,
    branches, grain, barkDots, ribs, leaves, blossoms, late: g.late, fallSources,
  };
  return { ...partial, bounds: computeBounds(partial), duration: computeDuration(partial) };
}

export function generateTree(opts: TreeOptions): Tree {
  const it = treeSteps(opts);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
