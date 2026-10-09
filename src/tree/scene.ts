import type { Bounds } from "./geometry";
import type { Fit } from "./renderer";

/**
 * Square frame for the scene video. The trunk sits on the ground, centred,
 * and the square stays inside the narrower half of the crown so it cannot
 * cross the text.
 */
export function sceneBox(fit: Fit, bounds: Bounds): { left: number; top: number; size: number } {
  const half = Math.min(Math.max(0, -bounds.minX), Math.max(0, bounds.maxX)) * fit.scale;
  const height = Math.max(0, bounds.maxY - bounds.minY) * fit.scale;
  const size = Math.min(half * 2, height);
  return {
    size,
    left: fit.originX - size / 2,
    top: fit.groundY - size,
  };
}

/**
 * Turns the cream paper of the generated clip transparent.
 * Near-white, low-saturation pixels fade out. Pink petals and the pale shirt
 * stay, because they are either more saturated or darker than the paper.
 */
export function keyPaper(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread > 42) continue;
    const lum = (r + g + b) / 3;
    if (lum <= 198) continue;
    const fade = Math.min(1, (lum - 198) / 28);
    data[i + 3] = Math.round(data[i + 3] * (1 - fade));
  }
}
