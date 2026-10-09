import {
  DOT, LEAF, RIB, SEG, mulberry32, swellLag,
  type LateSprig, type Rng, type Tree,
} from "./geometry";

/** The subset of CanvasRenderingContext2D the renderer uses (a fake one is enough for tests). */
export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | "setTransform" | "clearRect" | "save" | "restore" | "beginPath" | "closePath"
  | "moveTo" | "lineTo" | "quadraticCurveTo" | "arc" | "rect" | "fill" | "stroke" | "clip"
  | "fillStyle" | "strokeStyle" | "lineWidth" | "lineCap" | "lineJoin" | "globalAlpha"
>;

export interface CanvasLike {
  width: number;
  height: number;
  getContext(id: "2d"): Ctx2D | null;
}

/** Maps tree units to CSS pixels: px = originX + x·scale, py = groundY − y·scale. */
export interface Fit {
  scale: number;
  originX: number;
  groundY: number;
}

export interface Palette {
  ink: string;
  paper: string;
  /** Fill of closed blossoms. */
  blossom: string;
  /** Outline of open blossoms (and the darker pink of the flower masses). */
  blossomDeep: string;
}

export interface RendererOptions {
  breathing?: boolean;
}

const TAU = Math.PI * 2;
const HAIR_PX = 0.75;
const GROW_PX = 1.5;
const STIPPLE_PHASE = 0.3;
const FLUSH = 400;
/** Max primitives drawn onto ink per frame, so a full repaint is spread over a few frames. */
const FRAME_BUDGET = 3500;
/** A wood segment (quad + round cap, often large) costs far more to fill than a leaf. */
const WOOD_COST = 10;
const GRAIN_ALPHA = 0.85;

const SPROUT_TIME = 1.1;
const SPROUT_CHANCE = 0.45;
const BREATH_MIN = 2;
const BREATH_SPAN = 3;
const FALL_SCALE = 1.6;
const MAX_FALLING = 6;
const REST_TIME = 6;
const FADE_TIME = 1.2;

interface Faller {
  x0: number;
  y0: number;
  rx: number;
  ry: number;
  rot0: number;
  start: number;
  speed: number;
  amp: number;
  omega: number;
  phase: number;
  drift: number;
  landAt: number;
}

function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Thick segment as a quad plus a round end cap. All subpaths share one winding (clockwise). */
function segPath(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, w: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1e-9;
  const h = w / 2;
  const nx = (-dy / L) * h;
  const ny = (dx / L) * h;
  ctx.moveTo(x0 + nx, y0 + ny);
  ctx.lineTo(x1 + nx, y1 + ny);
  ctx.lineTo(x1 - nx, y1 - ny);
  ctx.lineTo(x0 - nx, y0 - ny);
  ctx.closePath();
  ctx.moveTo(x1 + h, y1);
  ctx.arc(x1, y1, h, 0, TAU, true);
}

function dotPath(ctx: Ctx2D, x: number, y: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TAU, true);
}

/** Lanceolate leaf: two quadratic arcs, pointed at both ends. */
function leafPath(ctx: Ctx2D, x: number, y: number, rx: number, ry: number, rot: number) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const k = Math.abs(ry) * 2;
  ctx.moveTo(x - c * rx, y - s * rx);
  ctx.quadraticCurveTo(x - s * k, y + c * k, x + c * rx, y + s * rx);
  ctx.quadraticCurveTo(x + s * k, y - c * k, x - c * rx, y - s * rx);
}

function ribPath(ctx: Ctx2D, x: number, y: number, len: number, bend: number, rot: number, f = 1) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const L = len * f;
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + (c * L) / 2 - s * bend * L, y + (s * L) / 2 + c * bend * L, x + c * L, y + s * L);
}

class Batch {
  private n = 0;
  constructor(private ctx: Ctx2D, private finish: (ctx: Ctx2D) => void) {
    ctx.beginPath();
  }
  tick() {
    if (++this.n >= FLUSH) {
      this.finish(this.ctx);
      this.ctx.beginPath();
      this.n = 0;
    }
  }
  end() {
    if (this.n > 0) this.finish(this.ctx);
    this.n = 0;
  }
}

export class TreeRenderer {
  private ink: Ctx2D;
  private live: Ctx2D;
  private tree: Tree | null = null;
  private fit: Fit = { scale: 1, originX: 0, groundY: 0 };
  private dpr = 1;
  private hair = 0.001;
  private growMin = 0.002;
  private t = 0;
  private cur = { branches: 0, grain: 0, dots: 0, ribs: 0, leaves: 0, blossoms: 0 };
  private growing: number[] = [];
  private sprouting: { sprig: LateSprig; start: number }[] = [];
  private sprouted: LateSprig[] = [];
  private lateNext = 0;
  private falling: Faller[] = [];
  private rng: Rng = mulberry32(1);
  private nextBreath = Infinity;
  private breathing: boolean;
  private behind = false;

  constructor(
    private inkCanvas: CanvasLike,
    private liveCanvas: CanvasLike,
    private palette: Palette,
    opts: RendererOptions = {},
  ) {
    const ink = inkCanvas.getContext("2d");
    const live = liveCanvas.getContext("2d");
    if (!ink || !live) throw new Error("Canvas 2D not available");
    this.ink = ink;
    this.live = live;
    this.breathing = opts.breathing ?? true;
  }

  /** Swaps the tree but keeps the clock: a rebuilt tree is redrawn up to the current time. */
  setTree(tree: Tree) {
    this.tree = tree;
    this.rng = mulberry32((tree.seed ^ 0x5bd1e995) >>> 0);
    this.nextBreath = tree.duration + 1.5 + 2 * this.rng();
    this.lateNext = 0;
    this.sprouting = [];
    this.sprouted = [];
    this.falling = [];
    this.repaint();
  }

  setPalette(palette: Palette) {
    this.palette = palette;
    this.repaint();
  }

  resize(cssWidth: number, cssHeight: number, dpr: number, fit: Fit) {
    this.dpr = dpr;
    this.fit = fit;
    this.hair = HAIR_PX / fit.scale;
    this.growMin = GROW_PX / fit.scale;
    for (const c of [this.inkCanvas, this.liveCanvas]) {
      c.width = Math.max(1, Math.round(cssWidth * dpr));
      c.height = Math.max(1, Math.round(cssHeight * dpr));
    }
    this.repaint();
  }

  get progress() {
    return { ...this.cur, growing: this.growing.length, time: this.t };
  }

  /** Something on screen is moving: keep the rAF loop alive. */
  get busy(): boolean {
    if (!this.tree) return false;
    if (this.behind || this.t < this.tree.duration || this.growing.length || this.sprouting.length) {
      return true;
    }
    return this.falling.some((f) => {
      const age = this.t - f.start;
      return age < f.landAt || age > f.landAt + REST_TIME;
    });
  }

  /** Tree time of the next scheduled change when idle (breath or a resting leaf starting to fade). */
  nextEventAt(): number {
    let next = this.breathing && this.tree ? this.nextBreath : Infinity;
    for (const f of this.falling) next = Math.min(next, f.start + f.landAt + REST_TIME);
    return next;
  }

  frame(t: number) {
    if (!this.tree) return;
    this.t = t;
    this.breathe(t);
    this.advance(t);
    this.drawLive(t);
  }

  /** Grows the next reserved sprig at the crown edge. */
  sprout(t = this.t): boolean {
    if (!this.tree || this.lateNext >= this.tree.late.length) return false;
    this.sprouting.push({ sprig: this.tree.late[this.lateNext++], start: t });
    return true;
  }

  /** Releases a lower-crown leaf that glides down and rests on the ground. */
  drop(t = this.t): boolean {
    const tree = this.tree;
    if (!tree || this.falling.length >= MAX_FALLING) return false;
    const n = tree.fallSources.length / LEAF;
    if (n === 0) return false;
    const r = this.rng;
    const o = Math.floor(r() * n) * LEAF;
    const F = tree.fallSources;
    const rx = F[o + 2] * FALL_SCALE;
    const ry = F[o + 3] * FALL_SCALE;
    const speed = 0.06 + 0.03 * r();
    this.falling.push({
      x0: F[o], y0: F[o + 1], rx, ry, rot0: F[o + 4], start: t, speed,
      amp: 0.025 + 0.03 * r(), omega: 1.3 + 0.8 * r(), phase: r() * TAU, drift: (r() - 0.5) * 0.05,
      landAt: Math.max(0.5, (F[o + 1] - Math.abs(ry)) / speed),
    });
    return true;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private applyTransform(ctx: Ctx2D) {
    const { scale, originX, groundY } = this.fit;
    const d = this.dpr;
    ctx.setTransform(d * scale, 0, 0, -d * scale, d * originX, d * groundY);
    ctx.beginPath();
    ctx.rect(-1e3, 0, 2e3, 1e3);
    ctx.clip();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  private clear(ctx: Ctx2D, canvas: CanvasLike) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  private repaint() {
    // A width assignment resets the context state, so transform and clip are re-applied here.
    this.inkCanvas.width = this.inkCanvas.width;
    this.liveCanvas.width = this.liveCanvas.width;
    this.applyTransform(this.ink);
    this.applyTransform(this.live);
    this.cur = { branches: 0, grain: 0, dots: 0, ribs: 0, leaves: 0, blossoms: 0 };
    this.growing = [];
    if (!this.tree) return;
    this.advance(this.t);
    for (const s of this.sprouted) this.drawSprig(this.ink, s, 1);
    this.drawLive(this.t);
  }

  private breathe(t: number) {
    const tree = this.tree;
    if (!this.breathing || !tree || t < tree.duration) return;
    if (t - this.nextBreath > BREATH_MIN + BREATH_SPAN) this.nextBreath = t;
    while (t >= this.nextBreath) {
      const wantsSprout = this.rng() < SPROUT_CHANCE;
      if (!(wantsSprout && this.sprout(t))) this.drop(t);
      this.nextBreath += BREATH_MIN + BREATH_SPAN * this.rng();
    }
  }

  /** Moves every cursor forward to `t`, drawing only what is new onto the ink plate. */
  private advance(t: number) {
    const tree = this.tree!;
    const ctx = this.ink;
    const { ink, paper } = this.palette;
    let budget = FRAME_BUDGET;

    // wood: new segments either start growing (live) or go straight to ink (hairlines)
    const B = tree.branches;
    const nB = B.length / SEG;
    ctx.fillStyle = ink;
    const wood = new Batch(ctx, (c) => c.fill());
    const settle = (i: number) => {
      const o = i * SEG;
      segPath(ctx, B[o], B[o + 1], B[o + 2], B[o + 3], Math.max(B[o + 4], this.hair));
      wood.tick();
    };
    let keep = 0;
    for (let k = 0; k < this.growing.length; k++) {
      const i = this.growing[k];
      if (t >= B[i * SEG + 5] + swellLag(B[i * SEG + 4])) settle(i);
      else this.growing[keep++] = i;
    }
    this.growing.length = keep;
    while (budget > 0 && this.cur.branches < nB && B[this.cur.branches * SEG + 5] <= t) {
      budget -= WOOD_COST;
      const i = this.cur.branches++;
      const w = B[i * SEG + 4];
      if (w >= this.growMin && t < B[i * SEG + 5] + swellLag(w)) this.growing.push(i);
      else settle(i);
    }
    wood.end();

    // grain: one path per frame, paper colour
    const G = tree.grain;
    if (this.cur.grain < G.length / SEG && G[this.cur.grain * SEG + 5] <= t) {
      ctx.strokeStyle = paper;
      ctx.lineWidth = this.hair * 0.9;
      ctx.globalAlpha = GRAIN_ALPHA;
      ctx.beginPath();
      while (budget > 0 && this.cur.grain < G.length / SEG && G[this.cur.grain * SEG + 5] <= t) {
        budget--;
        const o = this.cur.grain++ * SEG;
        ctx.moveTo(G[o], G[o + 1]);
        ctx.lineTo(G[o + 2], G[o + 3]);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // bark stipple on the lit edge
    const D = tree.barkDots;
    ctx.fillStyle = paper;
    const dots = new Batch(ctx, (c) => c.fill());
    while (budget > 0 && this.cur.dots < D.length / DOT && D[this.cur.dots * DOT + 3] <= t) {
      budget--;
      const o = this.cur.dots++ * DOT;
      dotPath(ctx, D[o], D[o + 1], Math.max(D[o + 2], this.hair * 0.6));
      dots.tick();
    }
    dots.end();

    // ribs
    const R = tree.ribs;
    ctx.strokeStyle = ink;
    ctx.lineWidth = this.hair;
    const ribs = new Batch(ctx, (c) => c.stroke());
    while (budget > 0 && this.cur.ribs < R.length / RIB && R[this.cur.ribs * RIB + 5] <= t) {
      budget--;
      const o = this.cur.ribs++ * RIB;
      ribPath(ctx, R[o], R[o + 1], R[o + 2], R[o + 3], R[o + 4]);
      ribs.tick();
    }
    ribs.end();

    // leaves and blossoms: closed ones filled, open ones paper with an outline
    for (const kind of ["leaves", "blossoms"] as const) {
      const L = tree[kind];
      const from = this.cur[kind];
      while (budget > 0 && this.cur[kind] < L.length / LEAF && L[this.cur[kind] * LEAF + 5] <= t) {
        budget--;
        this.cur[kind]++;
      }
      if (this.cur[kind] > from) this.drawLeaves(ctx, L, from, this.cur[kind], 1, kind);
    }
    this.behind = budget <= 0;
  }

  private drawLeaves(
    ctx: Ctx2D, L: Float32Array, from: number, to: number, scale: number,
    kind: "leaves" | "blossoms",
  ) {
    const { paper } = this.palette;
    const fill = kind === "leaves" ? this.palette.ink : this.palette.blossom;
    const outline = kind === "leaves" ? this.palette.ink : this.palette.blossomDeep;
    ctx.fillStyle = fill;
    const closed = new Batch(ctx, (c) => c.fill());
    for (let i = from; i < to; i++) {
      const o = i * LEAF;
      if (L[o + 3] < 0) continue;
      leafPath(ctx, L[o], L[o + 1], L[o + 2] * scale, L[o + 3] * scale, L[o + 4]);
      closed.tick();
    }
    closed.end();
    ctx.lineWidth = this.hair;
    ctx.strokeStyle = outline;
    const open = new Batch(ctx, (c) => {
      c.fillStyle = paper;
      c.fill();
      c.stroke();
    });
    for (let i = from; i < to; i++) {
      const o = i * LEAF;
      if (L[o + 3] >= 0) continue;
      leafPath(ctx, L[o], L[o + 1], L[o + 2] * scale, L[o + 3] * scale, L[o + 4]);
      open.tick();
    }
    open.end();
  }

  private drawSprig(ctx: Ctx2D, s: LateSprig, p: number) {
    const R = s.ribs;
    ctx.strokeStyle = this.palette.ink;
    ctx.lineWidth = this.hair;
    ctx.beginPath();
    for (let o = 0; o < R.length; o += RIB) ribPath(ctx, R[o], R[o + 1], R[o + 2], R[o + 3], R[o + 4], p);
    ctx.stroke();
    for (const kind of ["leaves", "blossoms"] as const) {
      const L = s[kind];
      if (p >= 1) {
        this.drawLeaves(ctx, L, 0, L.length / LEAF, 1, kind);
        continue;
      }
      for (let i = 0; i < L.length / LEAF; i++) {
        const o = i * LEAF;
        const k = Math.min(1, Math.max(0, (p - L[o + 5]) / 0.25));
        if (k > 0) this.drawLeaves(ctx, L.subarray(o, o + LEAF), 0, 1, k, kind);
      }
    }
  }

  private drawLive(t: number) {
    const tree = this.tree!;
    const ctx = this.live;
    this.clear(ctx, this.liveCanvas);
    const { ink, paper } = this.palette;

    // growth front: thickening stipple, then a solid stroke swelling with ease-out
    if (this.growing.length) {
      const B = tree.branches;
      ctx.fillStyle = ink;
      const batch = new Batch(ctx, (c) => c.fill());
      for (const i of this.growing) {
        const o = i * SEG;
        const w = B[o + 4];
        const p = (t - B[o + 5]) / swellLag(w);
        if (p < STIPPLE_PHASE) {
          const q = p / STIPPLE_PHASE;
          const dx = B[o + 2] - B[o];
          const dy = B[o + 3] - B[o + 1];
          const L = Math.hypot(dx, dy) || 1e-9;
          const K = Math.min(12, Math.max(3, Math.round((L / w) * 4)));
          const r = Math.max(this.hair * 0.8, w * 0.16);
          for (let k = 0; k < K; k++) {
            if (hash(i, k * 3) > q) continue;
            const u = hash(i, k * 3 + 1);
            const a = hash(i, k * 3 + 2) - 0.5;
            dotPath(ctx, B[o] + dx * u - (dy / L) * a * w, B[o + 1] + dy * u + (dx / L) * a * w, r);
            batch.tick();
          }
        } else {
          const q = (p - STIPPLE_PHASE) / (1 - STIPPLE_PHASE);
          segPath(ctx, B[o], B[o + 1], B[o + 2], B[o + 3], w * (0.35 + 0.65 * easeOutCubic(q)));
          batch.tick();
        }
      }
      batch.end();
    }

    // sprouting sprigs
    if (this.sprouting.length) {
      let keep = 0;
      for (const s of this.sprouting) {
        const p = Math.min(1, (t - s.start) / SPROUT_TIME);
        if (p >= 1) {
          this.drawSprig(this.ink, s.sprig, 1);
          this.sprouted.push(s.sprig);
        } else {
          this.drawSprig(ctx, s.sprig, easeOutCubic(p));
          this.sprouting[keep++] = s;
        }
      }
      this.sprouting.length = keep;
    }

    // falling blossoms
    if (this.falling.length) {
      const { blossom, blossomDeep } = this.palette;
      let keep = 0;
      for (const f of this.falling) {
        const age = t - f.start;
        const fadeAt = f.landAt + REST_TIME;
        if (age >= fadeAt + FADE_TIME) continue;
        this.falling[keep++] = f;
        const a = Math.min(age, f.landAt);
        const sway = Math.sin(f.omega * a + f.phase);
        const x = f.x0 + f.drift * a + f.amp * (sway - Math.sin(f.phase));
        const y = Math.max(Math.abs(f.ry), f.y0 - f.speed * a);
        const flat = Math.cos(f.rot0) >= 0 ? 0 : Math.PI;
        const tumble = f.rot0 + 0.9 * Math.sin(f.omega * a + f.phase + 0.6);
        const rot = tumble + (flat - tumble) * smoothstep(f.landAt - 0.8, f.landAt, a);
        ctx.globalAlpha = age > fadeAt ? 1 - (age - fadeAt) / FADE_TIME : 1;
        ctx.beginPath();
        leafPath(ctx, x, y, f.rx, f.ry, rot);
        ctx.fillStyle = f.ry < 0 ? paper : blossom;
        ctx.fill();
        if (f.ry < 0) {
          ctx.strokeStyle = blossomDeep;
          ctx.lineWidth = this.hair;
          ctx.stroke();
        }
      }
      this.falling.length = keep;
      ctx.globalAlpha = 1;
    }
  }
}
