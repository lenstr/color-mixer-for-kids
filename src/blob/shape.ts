// Geometry shared by the blob's simulation and its WebGL renderer.

export const EMPTY_COLOR = '#F4EBDC';
/** The blob's layout box in blob units: its viewBox is −150 −140 300 250. */
export const BOX = { x: -150, y: -140, w: 300, h: 250 };
/** y of the floor the blob sits on, in blob units. */
export const GROUND = 78;
/** Radius of the body at rest; it breathes a few percent around it. */
export const BODY_R = 104;
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
      BODY_R *
        (1 +
          0.032 * Math.sin(t * 1.6 + i * 1.9 + seed) +
          0.022 * Math.sin(t * 2.7 + i * 3.1 + seed * 2)),
    );
  }
  return r;
}
