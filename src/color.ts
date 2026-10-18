// Paint mixing model.
//
// Kids learn the painter's RYB wheel (red + yellow = orange, yellow + blue =
// green, red + blue = purple), which a plain RGB average cannot reproduce.
// We place hand-picked paint colors on the corners of an RYB cube and
// interpolate between them in OKLab, so in-between mixes stay vivid and
// perceptually even. White tints and black shades the result afterwards.

export type Pigment = 'red' | 'yellow' | 'blue' | 'white' | 'black';
export const PIGMENTS: Pigment[] = ['red', 'yellow', 'blue', 'white', 'black'];

export type Drops = Record<Pigment, number>;

export const emptyDrops = (): Drops => ({ red: 0, yellow: 0, blue: 0, white: 0, black: 0 });

export const totalDrops = (d: Drops): number =>
  d.red + d.yellow + d.blue + d.white + d.black;

type Lab = [number, number, number];
export type RGB = [number, number, number];

// RYB cube corners, sRGB hex.
const CORNERS = {
  none: '#FFFDF7',
  r: '#E8273F',
  y: '#FFD21F',
  b: '#1F62D8',
  ry: '#FF8A1C',
  rb: '#8A3FC4',
  yb: '#2BAE4C',
  ryb: '#6E4428',
};

const WHITE = '#FFFDF7';
const BLACK = '#1D1A22';

// ---------- sRGB <-> OKLab ----------

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

const toLinear = (c: number) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) => {
  c = Math.max(0, c);
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return v * 255;
};

function rgbToLab([R, G, B]: RGB): Lab {
  const r = toLinear(R), g = toLinear(G), b = toLinear(B);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function labToRgb([L, a, b]: Lab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const hexToLab = (hex: string) => rgbToLab(hexToRgb(hex));
const labToHex = (lab: Lab) => rgbToHex(labToRgb(lab));

const lerpLab = (a: Lab, b: Lab, t: number): Lab => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const C = Object.fromEntries(Object.entries(CORNERS).map(([k, v]) => [k, hexToLab(v)])) as Record<
  keyof typeof CORNERS,
  Lab
>;
const WHITE_LAB = hexToLab(WHITE);
const BLACK_LAB = hexToLab(BLACK);

function ryb(r: number, y: number, b: number): Lab {
  // Trilinear interpolation across the eight cube corners.
  const x0 = lerpLab(C.none, C.r, r);
  const x1 = lerpLab(C.y, C.ry, r);
  const x2 = lerpLab(C.b, C.rb, r);
  const x3 = lerpLab(C.yb, C.ryb, r);
  const y0 = lerpLab(x0, x1, y);
  const y1 = lerpLab(x2, x3, y);
  return lerpLab(y0, y1, b);
}

/**
 * Lighten with white like gouache does: lightness rises linearly, but
 * colorfulness fades slower (pastels stay lively), and reds drift towards
 * pink instead of salmon.
 */
function tint([L, a, b]: Lab, t: number): Lab {
  const c = Math.hypot(a, b);
  let h = Math.atan2(b, a);
  const deg = (h * 180) / Math.PI;
  if (deg > -10 && deg < 60) h -= ((22 * Math.PI) / 180) * t * Math.max(0, 1 - Math.abs(deg - 20) / 40);
  const c2 = c * (1 - t) ** 0.75;
  return [L + (WHITE_LAB[0] - L) * t, c2 * Math.cos(h), c2 * Math.sin(h)];
}

/** Resulting paint color for a set of drops, as OKLab. */
export function mixLab(d: Drops): Lab | null {
  const total = totalDrops(d);
  if (total === 0) return null;
  const chroma = d.red + d.yellow + d.blue;
  let lab: Lab;
  if (chroma > 0) {
    const m = Math.max(d.red, d.yellow, d.blue);
    lab = ryb(d.red / m, d.yellow / m, d.blue / m);
    if (d.white) lab = tint(lab, d.white / (chroma + d.white));
  } else {
    lab = d.white ? WHITE_LAB : BLACK_LAB;
  }
  if (d.black) lab = lerpLab(lab, BLACK_LAB, (d.black / total) ** 0.75);
  return lab;
}

export function mixHex(d: Drops): string | null {
  const lab = mixLab(d);
  return lab ? labToHex(lab) : null;
}

/** Perceptual distance (OKLab ΔE × 100). ~2 is indistinguishable for kids. */
export function distance(a: Drops, b: Drops): number {
  const la = mixLab(a), lb = mixLab(b);
  if (!la || !lb) return Infinity;
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]) * 100;
}

export function mixHexes(a: string, b: string, t: number): string {
  return labToHex(lerpLab(hexToLab(a), hexToLab(b), t));
}

export function shade(hex: string, amount: number): string {
  return mixHexes(hex, amount > 0 ? '#FFFFFF' : BLACK, Math.abs(amount));
}

/** Relative luminance-ish lightness, 0..1. */
export const lightness = (hex: string) => hexToLab(hex)[0];
