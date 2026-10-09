/**
 * Generates the first N seeds in both shapes and lists the ones that pass every guard,
 * best first. Pick 7 by eye (open the site with ?seed=<n>) and paste them in seeds.ts.
 */
import { generateTree } from "../src/tree/geometry";
import { passesGuards, seedMetrics, GUARDS } from "../src/tree/seeds";

const N = Number(process.argv[2] ?? 600);
const passing: { seed: number; score: number }[] = [];

for (let seed = 1; seed <= N; seed++) {
  const wide = seedMetrics(generateTree({ seed, shape: "wide", detail: 1 }));
  const tall = seedMetrics(generateTree({ seed, shape: "tall", detail: 1 }));
  if (!passesGuards(wide) || !passesGuards(tall)) continue;
  const margin = (m: typeof wide) =>
    Math.min(
      (GUARDS.maxBoundsAsymmetry - m.asymmetry) / GUARDS.maxBoundsAsymmetry,
      (m.massBalance - GUARDS.minMassBalance) / (1 - GUARDS.minMassBalance),
      (m.dome - GUARDS.minDome) / GUARDS.minDome,
      (m.sectorRatio - GUARDS.minSectorRatio) / (1 - GUARDS.minSectorRatio),
    );
  passing.push({ seed, score: Math.min(margin(wide), margin(tall)) });
}

passing.sort((a, b) => b.score - a.score);
console.log(`${passing.length}/${N} seeds pass in both shapes`);
console.log(passing.slice(0, 30).map((p) => `${p.seed} (${p.score.toFixed(2)})`).join("\n"));
