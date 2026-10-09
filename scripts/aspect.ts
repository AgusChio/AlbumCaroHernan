import { generateTree } from "../src/tree/geometry";

const seeds = process.argv.slice(2).map(Number);
for (const seed of seeds) {
  const b = generateTree({ seed, shape: "wide", detail: 0.8 }).bounds;
  const aspect = Math.ceil((b.maxY / (b.maxX - b.minX)) * 100) / 100;
  console.log(`${seed}: ${aspect},`);
}
