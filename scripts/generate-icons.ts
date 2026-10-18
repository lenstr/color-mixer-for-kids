// Renders the app icons (the Klyaksa mascot on paper) into public/icons.
//
//   bun scripts/generate-icons.ts
//
// Needs rsvg-convert (brew install librsvg).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = join(import.meta.dir, '..', 'public', 'icons');
const INK = '#2B2340';
const PAPER = '#FFF4E2';
const BODY = '#FF8A1C';

/** Same silhouette as the in-game blob (src/blob.ts shapePath) at rest. */
function blobPath() {
  const N = 9;
  const seed = 1.7;
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
    const r = 104 * (1 + 0.032 * Math.sin(i * 1.9 + seed) + 0.022 * Math.sin(i * 3.1 + seed * 2));
    let x = Math.cos(ang) * r * 1.06;
    let y = Math.sin(ang) * r - 6;
    if (y > 58) y = 58 + (y - 58) * 0.42;
    if (y > 40) x *= 1.04;
    pts.push([x, y]);
  }
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

/** The mascot in its own coordinates, centred around (0, 0). */
function mascot() {
  const d = blobPath();
  return `
    <ellipse cx="0" cy="84" rx="98" ry="12" fill="${INK}" opacity=".16"/>
    <clipPath id="body"><path d="${d}"/></clipPath>
    <path d="${d}" fill="${BODY}"/>
    <g clip-path="url(#body)">
      <path d="M-120 40 Q-40 10 20 50 T130 30 V140 H-120 Z" fill="#E8273F" opacity=".22"/>
      <rect x="-150" y="-150" width="300" height="300" fill="url(#shade)"/>
      <ellipse cx="-48" cy="-52" rx="24" ry="11" fill="#fff" opacity=".6" transform="rotate(-38 -48 -52)"/>
      <circle cx="-22" cy="-72" r="5.5" fill="#fff" opacity=".6"/>
    </g>
    <path d="${d}" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
    <g>
      <ellipse cx="-34" cy="-18" rx="17" ry="20" fill="#fff" stroke="${INK}" stroke-width="5.5"/>
      <ellipse cx="34" cy="-18" rx="17" ry="20" fill="#fff" stroke="${INK}" stroke-width="5.5"/>
      <circle cx="-31" cy="-14" r="9.5" fill="${INK}"/>
      <circle cx="37" cy="-14" r="9.5" fill="${INK}"/>
      <circle cx="-27.5" cy="-18.5" r="3.4" fill="#fff"/>
      <circle cx="40.5" cy="-18.5" r="3.4" fill="#fff"/>
      <ellipse cx="-60" cy="10" rx="13" ry="8" fill="#FF5F8F" opacity=".4"/>
      <ellipse cx="60" cy="10" rx="13" ry="8" fill="#FF5F8F" opacity=".4"/>
      <path d="M-18 18 Q0 36 18 18" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    </g>`;
}

const DEFS = `
  <defs>
    <radialGradient id="shade" cx="38%" cy="30%" r="75%">
      <stop offset="0" stop-color="#fff" stop-opacity=".28"/>
      <stop offset=".45" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".8" stop-color="#000" stop-opacity=".06"/>
      <stop offset="1" stop-color="#000" stop-opacity=".24"/>
    </radialGradient>
  </defs>`;

/** Paper background with soft paint splotches, filling the 512 square. */
const PAPER_BG = `
  <rect width="512" height="512" fill="${PAPER}"/>
  <circle cx="70" cy="60" r="150" fill="#FFD21F" opacity=".38"/>
  <circle cx="470" cy="470" r="150" fill="#FF98A7" opacity=".32"/>
  <circle cx="480" cy="40" r="90" fill="#2BAE4C" opacity=".14"/>`;

/**
 * `scale` sizes the mascot; maskable icons keep it inside the central
 * 80% safe circle so launchers can crop to any shape.
 */
function icon({ maskable, scale }: { maskable: boolean; scale: number }) {
  const body = `${PAPER_BG}<g transform="translate(256 262) scale(${scale})">${mascot()}</g>`;
  if (maskable) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${DEFS}${body}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${DEFS}
    <clipPath id="tile"><rect width="512" height="512" rx="116"/></clipPath>
    <g clip-path="url(#tile)">${body}</g>
    <rect x="6" y="6" width="500" height="500" rx="110" fill="none" stroke="${INK}" stroke-width="12"/>
  </svg>`;
}

mkdirSync(OUT, { recursive: true });

const any = icon({ maskable: false, scale: 1.5 });
const maskable = icon({ maskable: true, scale: 1.3 });
// iOS draws its own rounded corners and dislikes transparency.
const apple = icon({ maskable: true, scale: 1.5 });

writeFileSync(join(OUT, 'icon.svg'), any);

const png = (svg: string, size: number, name: string) => {
  const src = join(OUT, `.tmp-${name}.svg`);
  writeFileSync(src, svg);
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', join(OUT, name), src]);
  execFileSync('rm', [src]);
  console.log(`icons/${name}`);
};

png(any, 192, 'icon-192.png');
png(any, 512, 'icon-512.png');
png(maskable, 512, 'maskable-512.png');
png(maskable, 192, 'maskable-192.png');
png(apple, 180, 'apple-touch-icon.png');
png(any, 64, 'favicon-64.png');
