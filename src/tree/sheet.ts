// Dev-only contact sheet: /sheet.html?seeds=1,2,3&shape=wide&detail=0.8
import { generateTree, type Shape } from "./geometry";
import { TreeRenderer } from "./renderer";
import { fitTree, readPalette } from "./layout";
import { passesGuards, seedMetrics, CURATED_SEEDS } from "./seeds";

const params = new URLSearchParams(location.search);
const shape = (params.get("shape") as Shape) ?? "wide";
const seeds = params.get("seeds")?.split(",").map(Number) ?? [...CURATED_SEEDS];
const detail = Number(params.get("detail") ?? 1);
const grid = document.getElementById("grid")!;
const style = getComputedStyle(document.documentElement);
const palette = readPalette((n) => style.getPropertyValue(n));

for (const seed of seeds) {
  const fig = document.createElement("figure");
  if (shape === "tall") fig.className = "tall";
  const ink = document.createElement("canvas");
  const live = document.createElement("canvas");
  const cap = document.createElement("figcaption");
  fig.append(ink, live, cap);
  grid.append(fig);

  const tree = generateTree({ seed, shape, detail });
  const m = seedMetrics(tree);
  cap.textContent = `${seed} ${passesGuards(m) ? "✓" : "✗"} a${m.asymmetry.toFixed(2)} b${m.massBalance.toFixed(2)} d${m.dome.toFixed(2)} s${m.sectorRatio.toFixed(2)}`;
  const { width, height } = fig.getBoundingClientRect();
  const r = new TreeRenderer(ink, live, palette, { breathing: false });
  r.setTree(tree);
  r.resize(width, height, 2, fitTree({ top: 16, groundY: height - 12, width, bounds: tree.bounds }));
  do r.frame(tree.duration);
  while (r.busy);
}
