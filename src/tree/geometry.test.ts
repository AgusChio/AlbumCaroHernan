import { describe, expect, it } from "vitest";
import {
  DOT, LEAF, RIB, SEG, generateTree, mulberry32, sortByTime, treeSteps, type Tree,
} from "./geometry";

const shapes = ["wide", "tall"] as const;
const opts = (seed: number, shape: (typeof shapes)[number]) => ({ seed, shape, detail: 1 });

function sortedByT(a: Float32Array, stride: number) {
  for (let i = stride * 2 - 1; i < a.length; i += stride) {
    if (a[i] < a[i - stride]) return false;
  }
  return true;
}

function eachPoint(tree: Tree, fn: (x: number, y: number) => void) {
  const { branches: B, barkDots: D, leaves: L, blossoms: F, ribs: R, grain: G } = tree;
  for (let i = 0; i < F.length; i += LEAF) fn(F[i], F[i + 1]);
  for (let i = 0; i < B.length; i += SEG) { fn(B[i], B[i + 1]); fn(B[i + 2], B[i + 3]); }
  for (let i = 0; i < G.length; i += SEG) { fn(G[i], G[i + 1]); fn(G[i + 2], G[i + 3]); }
  for (let i = 0; i < D.length; i += DOT) fn(D[i], D[i + 1]);
  for (let i = 0; i < L.length; i += LEAF) fn(L[i], L[i + 1]);
  for (let i = 0; i < R.length; i += RIB) fn(R[i], R[i + 1]);
  for (const s of tree.late) {
    for (let i = 0; i < s.leaves.length; i += LEAF) fn(s.leaves[i], s.leaves[i + 1]);
  }
}

describe("rng", () => {
  it("is deterministic and in [0, 1)", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe.each(shapes)("geometry (%s)", (shape) => {
  const tree = generateTree(opts(11, shape));

  it("same seed → identical arrays", () => {
    const again = generateTree(opts(11, shape));
    for (const k of ["branches", "grain", "barkDots", "ribs", "leaves", "blossoms", "fallSources"] as const) {
      expect(again[k]).toEqual(tree[k]);
    }
    expect(again.late.length).toBe(tree.late.length);
    expect(again.bounds).toEqual(tree.bounds);
  });

  it("different seeds → different trees", () => {
    expect(generateTree(opts(12, shape)).branches).not.toEqual(tree.branches);
  });

  it("every array is sorted by t", () => {
    expect(sortedByT(tree.branches, SEG)).toBe(true);
    expect(sortedByT(tree.grain, SEG)).toBe(true);
    expect(sortedByT(tree.barkDots, DOT)).toBe(true);
    expect(sortedByT(tree.ribs, RIB)).toBe(true);
    expect(sortedByT(tree.leaves, LEAF)).toBe(true);
    expect(sortedByT(tree.blossoms, LEAF)).toBe(true);
  });

  it("everything lies inside bounds", () => {
    const { minX, maxX, minY, maxY } = tree.bounds;
    eachPoint(tree, (x, y) => {
      expect(x).toBeGreaterThanOrEqual(minX);
      expect(x).toBeLessThanOrEqual(maxX);
      expect(y).toBeGreaterThanOrEqual(minY);
      expect(y).toBeLessThanOrEqual(maxY);
    });
  });

  it("has a plausible size and timeline", () => {
    expect(tree.bounds.maxY).toBeGreaterThan(0.8);
    expect(tree.bounds.maxY).toBeLessThan(1.25);
    expect(tree.bounds.minY).toBeGreaterThan(-0.1);
    expect(tree.duration).toBeGreaterThan(3);
    expect(tree.duration).toBeLessThan(10);
    expect(tree.blossoms.length / LEAF).toBeGreaterThan(2000);
    expect(tree.leaves.length).toBeGreaterThan(0);
    expect(tree.blossoms.length).toBeGreaterThan(tree.leaves.length);
    expect(tree.late.length).toBeGreaterThan(0);
    expect(tree.fallSources.length).toBeGreaterThan(0);
  });

  it("no branch sweeps the floor (only roots near the ground)", () => {
    const B = tree.branches;
    for (let i = 0; i < B.length; i += SEG) {
      const nearFoot = Math.abs(B[i]) < 0.15;
      if (!nearFoot) expect(Math.min(B[i + 1], B[i + 3])).toBeGreaterThan(0.02);
    }
  });

  it("fall sources come from the lower crown", () => {
    const F = tree.fallSources;
    for (let i = 0; i < F.length; i += LEAF) {
      expect(F[i + 1]).toBeLessThan(tree.envelope.cy);
    }
  });

  it("treeSteps and generateTree agree, and treeSteps yields several slices", () => {
    const it = treeSteps(opts(11, shape));
    let slices = 0;
    let r = it.next();
    while (!r.done) {
      slices++;
      r = it.next();
    }
    expect(slices).toBeGreaterThan(4);
    expect(r.value.branches).toEqual(tree.branches);
    expect(r.value.leaves).toEqual(tree.leaves);
  });

  it("lower detail produces less work", () => {
    let high = 0;
    let low = 0;
    for (let seed = 1; seed <= 6; seed++) {
      high += generateTree({ seed, shape, detail: 1 }).branches.length;
      low += generateTree({ seed, shape, detail: 0.8 }).branches.length;
    }
    expect(low).toBeLessThan(high);
  });
});

describe("sortByTime", () => {
  it("sorts rows by the last column, stable", () => {
    const a = new Float32Array([1, 3, 2, 1, 3, 1, 4, 2]);
    expect(Array.from(sortByTime(a, 2))).toEqual([2, 1, 3, 1, 4, 2, 1, 3]);
  });
});
