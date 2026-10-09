import { describe, expect, it } from "vitest";
import { generateTree } from "./geometry";
import { CURATED_SEEDS, GUARDS, PHONE_ASPECT, seedForDay, seedMetrics, weekdayIn } from "./seeds";

describe("seedForDay", () => {
  it("has one seed per weekday", () => {
    expect(CURATED_SEEDS).toHaveLength(7);
    expect(new Set(CURATED_SEEDS).size).toBe(7);
  });

  it("switches at local midnight (UTC−3), not at UTC midnight", () => {
    // Fri 2026-10-09 23:59 in Buenos Aires = Sat 02:59 UTC
    const beforeMidnight = new Date("2026-10-10T02:59:00Z");
    const afterMidnight = new Date("2026-10-10T03:01:00Z");
    expect(weekdayIn(beforeMidnight)).toBe(5);
    expect(weekdayIn(afterMidnight)).toBe(6);
    expect(seedForDay(beforeMidnight)).toBe(CURATED_SEEDS[5]);
    expect(seedForDay(afterMidnight)).toBe(CURATED_SEEDS[6]);
  });

  it("UTC midnight does not change the day", () => {
    expect(weekdayIn(new Date("2026-10-09T23:59:00Z"))).toBe(5);
    expect(weekdayIn(new Date("2026-10-10T00:01:00Z"))).toBe(5);
  });
});

describe.each(CURATED_SEEDS.map((s) => [s]))("curated seed %i", (seed) => {
  it.each(["wide", "tall"] as const)("passes the guards (%s)", (shape) => {
    const m = seedMetrics(generateTree({ seed, shape, detail: 1 }));
    expect(m.asymmetry).toBeLessThan(GUARDS.maxBoundsAsymmetry);
    expect(m.massBalance).toBeGreaterThan(GUARDS.minMassBalance);
    expect(m.dome).toBeGreaterThan(GUARDS.minDome);
    expect(m.sectorRatio).toBeGreaterThan(GUARDS.minSectorRatio);
  });

  it("has an up-to-date phone aspect (rounded up, within 0.01)", () => {
    const b = generateTree({ seed, shape: "wide", detail: 0.8 }).bounds;
    const aspect = b.maxY / (b.maxX - b.minX);
    expect(PHONE_ASPECT[seed]).toBeGreaterThanOrEqual(aspect);
    expect(PHONE_ASPECT[seed] - aspect).toBeLessThan(0.01);
  });
});
