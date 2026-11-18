// Where to put a region's hint dot: the visible point farthest from the
// region's edges and from the drawing on top of it (faces, veins). Bounding-
// box centers fail for rings (the rainbow) and for regions mostly covered by
// others (the sky), so the picture is rasterised once into a small label map
// and a distance transform finds each region's deepest pixel.

import type { Picture } from './pictures';

const GRID = 100; // label map size; the artboard is 400 units
const UNIT = 400 / GRID;

export interface Anchor {
  x: number;
  y: number;
  /** distance to the nearest edge, in artboard units */
  room: number;
}

const cache = new Map<string, Promise<Record<string, Anchor>>>();

export function anchors(pic: Picture): Promise<Record<string, Anchor>> {
  let hit = cache.get(pic.id);
  if (!hit) cache.set(pic.id, (hit = compute(pic)));
  return hit;
}

/** Alpha of the decoration drawn at label-map size. */
async function decoMask(pic: Picture) {
  const img = new Image();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="${GRID}" height="${GRID}">${pic.deco}</svg>`;
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GRID;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, GRID, GRID).data;
}

async function compute(pic: Picture): Promise<Record<string, Anchor>> {
  const deco = await decoMask(pic).catch(() => null);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GRID;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.scale(1 / UNIT, 1 / UNIT);
  const paths = new Map(pic.regions.map((r) => [r.id, new Path2D(r.d)]));
  pic.regions.forEach((r, i) => {
    ctx.save();
    if (r.clip) ctx.clip(paths.get(r.clip)!);
    ctx.fillStyle = `rgb(${i + 1} 0 0)`;
    ctx.fill(paths.get(r.id)!);
    ctx.restore();
  });
  const px = ctx.getImageData(0, 0, GRID, GRID).data;
  const label = new Int16Array(GRID * GRID);
  for (let i = 0; i < label.length; i++) label[i] = px[i * 4 + 3] === 255 ? px[i * 4] - 1 : -1;
  // pixels under the drawing belong to no region, so dots keep clear of it
  if (deco) for (let i = 0; i < label.length; i++) if (deco[i * 4 + 3] > 24) label[i] = -1;

  const out: Record<string, Anchor> = {};
  const dist = new Float32Array(GRID * GRID);
  pic.regions.forEach((r, k) => {
    // two-pass chamfer distance to the nearest pixel of another label
    const D = 1, D2 = Math.SQRT2;
    for (let i = 0; i < dist.length; i++) dist[i] = label[i] === k ? Infinity : 0;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= GRID || y >= GRID ? 0 : dist[y * GRID + x]);
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) {
        const i = y * GRID + x;
        if (!dist[i]) continue;
        dist[i] = Math.min(dist[i], at(x - 1, y) + D, at(x, y - 1) + D, at(x - 1, y - 1) + D2, at(x + 1, y - 1) + D2);
      }
    let best = -1, bx = 0, by = 0;
    for (let y = GRID - 1; y >= 0; y--)
      for (let x = GRID - 1; x >= 0; x--) {
        const i = y * GRID + x;
        if (!dist[i]) continue;
        dist[i] = Math.min(dist[i], at(x + 1, y) + D, at(x, y + 1) + D, at(x + 1, y + 1) + D2, at(x - 1, y + 1) + D2);
        if (dist[i] > best) [best, bx, by] = [dist[i], x, y];
      }
    out[r.id] =
      best > 0
        ? { x: (bx + 0.5) * UNIT, y: (by + 0.5) * UNIT, room: best * UNIT }
        : { x: 200, y: 200, room: 0 };
  });
  return out;
}
