import { describe, expect, it } from "vitest";
import { keyPaper, sceneBox } from "./scene";

describe("sceneBox", () => {
  it("sits the square on the trunk without crossing the narrower side", () => {
    const box = sceneBox(
      { scale: 100, originX: 400, groundY: 500 },
      { minX: -0.9, maxX: 0.6, minY: -0.05, maxY: 1 },
    );
    expect(box.size).toBe(105);
    expect(box.left).toBe(347.5);
    expect(box.top).toBe(395);
    expect(box.left + box.size).toBeLessThanOrEqual(400 + 0.6 * 100);
  });
});

describe("keyPaper", () => {
  it("clears the cream paper and keeps the trunk, the shirt and the petals", () => {
    const data = new Uint8ClampedArray([
      242, 239, 226, 255,
      100, 116, 87, 255,
      202, 198, 183, 255,
      223, 165, 164, 255,
    ]);
    keyPaper(data);
    expect(data[3]).toBe(0);
    expect(data[7]).toBe(255);
    expect(data[11]).toBe(255);
    expect(data[15]).toBe(255);
  });
});
