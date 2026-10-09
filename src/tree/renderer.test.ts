import { beforeEach, describe, expect, it } from "vitest";
import { LEAF, SEG, generateTree, swellLag } from "./geometry";
import { TreeRenderer, type CanvasLike, type Ctx2D } from "./renderer";

class FakeCtx {
  calls: Record<string, number> = {};
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 1;
  lineCap = "butt";
  lineJoin = "miter";
  globalAlpha = 1;
  constructor() {
    const names = [
      "setTransform", "clearRect", "save", "restore", "beginPath", "closePath", "moveTo",
      "lineTo", "quadraticCurveTo", "arc", "rect", "fill", "stroke", "clip",
    ];
    for (const n of names) {
      (this as unknown as Record<string, () => void>)[n] = () => {
        this.calls[n] = (this.calls[n] ?? 0) + 1;
      };
    }
  }
  count(name: string) {
    return this.calls[name] ?? 0;
  }
  reset() {
    this.calls = {};
  }
}

class FakeCanvas implements CanvasLike {
  ctx = new FakeCtx();
  private w = 300;
  height = 150;
  get width() {
    return this.w;
  }
  set width(v: number) {
    this.w = v;
    this.ctx.calls.reset = (this.ctx.calls.reset ?? 0) + 1;
  }
  getContext() {
    return this.ctx as unknown as Ctx2D;
  }
}

const tree = generateTree({ seed: 5, shape: "wide", detail: 0.8 });
const palette = { ink: "rgb(1,2,3)", paper: "#fff", blossom: "#eba8b6", blossomDeep: "#d0808f" };
const fit = { scale: 600, originX: 600, groundY: 760 };
const settledAt = (() => {
  let d = 0;
  for (let i = 0; i < tree.branches.length; i += SEG) {
    d = Math.max(d, tree.branches[i + 5] + swellLag(tree.branches[i + 4]));
  }
  return d;
})();

/** Calls frame(t) until the budgeted ink plate has caught up. Returns the number of frames. */
function drawUntilIdle(r: TreeRenderer, t: number) {
  let frames = 0;
  do {
    r.frame(t);
    frames++;
  } while (r.busy && frames < 100);
  return frames;
}

describe("TreeRenderer", () => {
  let ink: FakeCanvas;
  let live: FakeCanvas;
  let r: TreeRenderer;

  beforeEach(() => {
    ink = new FakeCanvas();
    live = new FakeCanvas();
    r = new TreeRenderer(ink, live, palette, { breathing: false });
    r.setTree(tree);
    r.resize(1200, 800, 2, fit);
  });

  it("sizes both canvases by DPR", () => {
    expect(ink.width).toBe(2400);
    expect(live.height).toBe(1600);
  });

  it("cursors advance monotonically and only draw what is new", () => {
    r.frame(1);
    const a = r.progress;
    expect(a.branches).toBeGreaterThan(0);
    expect(a.leaves).toBe(0);
    ink.ctx.reset();
    r.frame(1);
    expect(r.progress.branches).toBe(a.branches);
    expect(ink.ctx.count("arc")).toBe(0);
    r.frame(3);
    expect(r.progress.branches).toBeGreaterThan(a.branches);
    drawUntilIdle(r, tree.duration);
    expect(r.progress.branches).toBe(tree.branches.length / SEG);
    expect(r.progress.leaves).toBe(tree.leaves.length / LEAF);
    expect(r.progress.blossoms).toBe(tree.blossoms.length / LEAF);
    expect(r.progress.growing).toBe(0);
  });

  it("heavy wood grows on the live layer before settling into ink", () => {
    r.frame(0.5);
    expect(r.progress.growing).toBeGreaterThan(0);
    expect(live.ctx.count("fill")).toBeGreaterThan(0);
    r.frame(settledAt + 0.01);
    expect(r.progress.growing).toBe(0);
  });

  it("never clears the ink plate while growing, clears live every frame", () => {
    ink.ctx.reset();
    live.ctx.reset();
    for (let t = 0; t < 3; t += 0.1) r.frame(t);
    expect(ink.ctx.count("clearRect")).toBe(0);
    expect(live.ctx.count("clearRect")).toBe(30);
  });

  it("resize repaints everything up to the current t", () => {
    drawUntilIdle(r, tree.duration);
    ink.ctx.reset();
    r.resize(900, 700, 1, { scale: 400, originX: 450, groundY: 650 });
    expect(ink.ctx.calls.reset).toBeGreaterThan(0);
    expect(ink.ctx.count("fill")).toBeGreaterThan(0);
    expect(ink.width).toBe(900);
    drawUntilIdle(r, tree.duration);
    expect(r.progress.branches).toBe(tree.branches.length / SEG);
    expect(r.progress.leaves).toBe(tree.leaves.length / LEAF);
  });

  it("spreads a full repaint over several frames and stays busy until done", () => {
    drawUntilIdle(r, tree.duration);
    r.resize(1200, 800, 2, fit);
    expect(r.busy).toBe(true);
    expect(r.progress.leaves).toBeLessThan(tree.leaves.length / LEAF);
    expect(drawUntilIdle(r, tree.duration)).toBeGreaterThan(1);
    expect(r.busy).toBe(false);
  });

  it("flushes big batches instead of building one huge path", () => {
    ink.ctx.reset();
    drawUntilIdle(r, tree.duration);
    const leaves = tree.leaves.length / LEAF;
    expect(ink.ctx.count("fill")).toBeGreaterThan((leaves + tree.blossoms.length / LEAF) / 400);
  });

  it("busy reflects growth, sprouts and falling leaves", () => {
    r.frame(1);
    expect(r.busy).toBe(true);
    drawUntilIdle(r, tree.duration + 0.1);
    expect(r.busy).toBe(false);

    expect(r.sprout()).toBe(true);
    expect(r.busy).toBe(true);
    r.frame(tree.duration + 1.5);
    expect(r.busy).toBe(false);

    expect(r.drop()).toBe(true);
    expect(r.busy).toBe(true);
    r.frame(tree.duration + 40);
    expect(r.busy).toBe(false);
  });

  it("limits the number of falling leaves", () => {
    r.frame(tree.duration);
    let ok = 0;
    for (let i = 0; i < 10; i++) if (r.drop()) ok++;
    expect(ok).toBe(6);
  });

  it("schedules breaths when breathing is on", () => {
    const b = new TreeRenderer(new FakeCanvas(), new FakeCanvas(), palette);
    b.setTree(tree);
    b.resize(1200, 800, 1, fit);
    drawUntilIdle(b, tree.duration + 0.1);
    const next = b.nextEventAt();
    expect(next).toBeGreaterThan(tree.duration);
    expect(next).toBeLessThan(tree.duration + 4);
    b.frame(next + 0.01);
    expect(b.busy).toBe(true);
  });
});
