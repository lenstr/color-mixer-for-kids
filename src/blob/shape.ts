// Geometry shared by the blob's simulation and its WebGL renderer.

export const INK = '#2B2340';
export const EMPTY_COLOR = '#F4EBDC';
/** y of the floor the blob sits on, in blob units (viewBox −150 −140 300 250). */
export const GROUND = 78;
export const CONTROL_POINTS = 9;

export type Mood = 'smile' | 'open' | 'happy' | 'yum' | 'hungry' | 'oops';
export const MOODS: Mood[] = ['smile', 'open', 'happy', 'yum', 'hungry', 'oops'];

/** Everything a renderer needs to draw one frame. */
export interface BlobFrame {
  /** radius of each control point, before the bottom is flattened */
  radii: number[];
  /** squash group transform: translate(tx ty) scale(sx sy) */
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  shadowRx: number;
  shadowOpacity: number;
  color: string;
  swirls: { color: string; rot: number; scale: number; opacity: number }[];
  look: { x: number; y: number };
  /** vertical eye scale, 1 = open */
  blink: number;
  mood: Mood;
  face: boolean;
}

export function controlRadii(t: number, seed: number): number[] {
  const r: number[] = [];
  for (let i = 0; i < CONTROL_POINTS; i++) {
    r.push(
      104 *
        (1 +
          0.032 * Math.sin(t * 1.6 + i * 1.9 + seed) +
          0.022 * Math.sin(t * 2.7 + i * 3.1 + seed * 2)),
    );
  }
  return r;
}
