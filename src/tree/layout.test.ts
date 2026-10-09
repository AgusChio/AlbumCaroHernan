import { describe, expect, it } from "vitest";
import {
  COPY_GAP, DESKTOP_ANCHOR, SIDE_MARGIN, STACKED_MAX_CROWN, capDpr, detailFor, fitTree, heroFrame,
  mixColors, parseColor, readPalette,
} from "./layout";

const bounds = { minX: -0.7, maxX: 0.65, minY: -0.05, maxY: 1 };

describe("device", () => {
  it("detail and dpr", () => {
    expect(detailFor(390, 8)).toBe(0.8);
    expect(detailFor(1440, 4)).toBe(0.8);
    expect(detailFor(1440, 8)).toBe(1);
    expect(detailFor(1440, undefined)).toBe(1);
    expect(capDpr(3)).toBe(2);
    expect(capDpr(1.5)).toBe(1.5);
    expect(capDpr(undefined)).toBe(1);
  });
});

describe("fit", () => {
  it("desktop anchors the trunk at 60% and keeps the crown inside", () => {
    const frame = heroFrame(1440, 900, { layout: "side", navHeight: 64, ground: 56 });
    expect(frame.anchorX).toBeCloseTo(1440 * DESKTOP_ANCHOR);
    const fit = fitTree({ ...frame, width: 1440, bounds });
    expect(fit.originX).toBeCloseTo(864);
    expect(fit.groundY).toBe(844);
    expect(fit.originX + bounds.maxX * fit.scale).toBeLessThanOrEqual(1440 - SIDE_MARGIN + 1e-6);
    expect(fit.originX + bounds.minX * fit.scale).toBeGreaterThanOrEqual(frame.clearLeft! - 1e-6);
    expect(fit.groundY - bounds.maxY * fit.scale).toBeGreaterThanOrEqual(frame.top - 1e-6);
  });

  it("stacked centres a lopsided crown and fills the width without clipping", () => {
    const frame = heroFrame(390, 844, { layout: "stacked", navHeight: 64, ground: 56 });
    expect(frame.anchorX).toBeUndefined();
    const lopsided = { ...bounds, minX: -0.9, maxX: 0.6 };
    const fit = fitTree({ ...frame, width: 390, bounds: lopsided });
    const left = fit.originX + lopsided.minX * fit.scale;
    const right = fit.originX + lopsided.maxX * fit.scale;
    expect(left).toBeCloseTo(SIDE_MARGIN, 6);
    expect(right).toBeCloseTo(390 - SIDE_MARGIN, 6);
  });

  it("stacked caps the crown width on tablets", () => {
    const frame = heroFrame(820, 1180, { layout: "stacked", navHeight: 64, ground: 56, copyBottom: 300 });
    const fit = fitTree({ ...frame, width: 820, bounds });
    const left = fit.originX + bounds.minX * fit.scale;
    const right = fit.originX + bounds.maxX * fit.scale;
    expect(right - left).toBeLessThanOrEqual(STACKED_MAX_CROWN + 1e-6);
    expect((left + right) / 2).toBeCloseTo(410, 6);
  });

  it("side keeps the crown clear of the measured copy block", () => {
    const frame = heroFrame(1024, 700, { layout: "side", navHeight: 64, ground: 56, copyRight: 420 });
    expect(frame.clearLeft).toBe(420 + COPY_GAP);
    expect(frame.anchorX).toBeGreaterThan(1024 * DESKTOP_ANCHOR);
    const fit = fitTree({ ...frame, width: 1024, bounds });
    expect(fit.originX + bounds.minX * fit.scale).toBeGreaterThanOrEqual(420 + COPY_GAP - 1e-6);
    expect(fit.originX + bounds.maxX * fit.scale).toBeLessThanOrEqual(1024 - SIDE_MARGIN + 1e-6);
  });

  it("stacked starts the crown below the copy block", () => {
    const frame = heroFrame(390, 844, { layout: "stacked", navHeight: 64, ground: 56, copyBottom: 330 });
    expect(frame.top).toBe(330 + COPY_GAP);
  });

  it("without an anchor the bounds are centred", () => {
    const fit = fitTree({ top: 0, groundY: 500, width: 1000, bounds });
    const l = fit.originX + bounds.minX * fit.scale;
    const r = fit.originX + bounds.maxX * fit.scale;
    expect((l + r) / 2).toBeCloseTo(500);
  });

  it("never bleeds past the side margins", () => {
    const fit = fitTree({ top: 0, groundY: 2000, width: 600, bounds });
    expect(fit.originX + bounds.minX * fit.scale).toBeGreaterThanOrEqual(SIDE_MARGIN - 1e-6);
  });
});

describe("palette", () => {
  it("parses hex and rgb", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
    expect(parseColor(" #A3C293 ")).toEqual([163, 194, 147]);
    expect(parseColor("rgb(1, 2, 3)")).toEqual([1, 2, 3]);
    expect(parseColor("nope")).toBeNull();
  });

  it("mixes 50%", () => {
    expect(mixColors("#000000", "#ffffff", 0.5)).toBe("rgb(128, 128, 128)");
  });

  it("ink = primary ⊕ text, paper = background, blossoms from their variables", () => {
    const vars: Record<string, string> = {
      "--color-primary": "#a3c293",
      "--color-text": "#4a4a3b",
      "--color-bg": " #faf6ec",
      "--color-blossom": " #eba8b6",
      "--color-blossom-deep": "#d0808f",
    };
    expect(readPalette((n) => vars[n] ?? "")).toEqual({
      ink: "rgb(119, 134, 103)",
      paper: "#faf6ec",
      blossom: "#eba8b6",
      blossomDeep: "#d0808f",
    });
  });

  it("derives the deep blossom when only the light one is set", () => {
    const vars: Record<string, string> = {
      "--color-primary": "#000000",
      "--color-text": "#000000",
      "--color-bg": "#ffffff",
      "--color-blossom": "#ffffff",
    };
    expect(readPalette((n) => vars[n] ?? "").blossomDeep).toBe("rgb(179, 179, 179)");
  });
});
