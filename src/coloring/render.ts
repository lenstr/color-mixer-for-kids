// Draws a coloring page as SVG markup: the painting screen, the gallery
// thumbnails and the PNG export all use the same drawing.

import type { Picture } from './pictures';

const UNPAINTED = '#FFFDF7';
const INK = '#2B2340';

let uidSeq = 0;

export interface PictureSVGOptions {
  /** unpainted parts get a dotted pattern instead of plain paper */
  dotted?: boolean;
  /** layers for the paint to spread into, for the painting screen */
  interactive?: boolean;
  /** standalone file with xmlns and a pixel size, for the PNG export */
  size?: number;
}

/**
 * Each region is a group of its fill, a layer that paint spreads into
 * (clipped to the region, interactive only) and its outline. A region
 * clipped to another one (spots on a cap) covers the inner edge of that
 * one's outline, so the outline is drawn again after its last such region.
 * Ids are unique per call, so many pictures can share a page.
 */
export function pictureSVG(pic: Picture, fills: Record<string, string>, opts: PictureSVGOptions = {}) {
  const uid = `pic${++uidSeq}`;
  const clipId = (rid: string) => `${uid}-${rid}`;
  const empty = opts.dotted ? `url(#${uid}-dots)` : UNPAINTED;
  const line = (d: string) =>
    `<path class="region-line" d="${d}" fill="none" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;

  const byId = new Map(pic.regions.map((r) => [r.id, r]));
  // parent id -> its last clipped child, then flipped: child -> parent to outline after it
  const lastChild = new Map(pic.regions.flatMap((r) => (r.clip ? [[r.clip, r.id] as const] : [])));
  const outlineAfter = new Map([...lastChild].map(([parent, child]) => [child, parent]));
  const clips = pic.regions
    .filter((r) => opts.interactive || lastChild.has(r.id))
    .map((r) => `<clipPath id="${clipId(r.id)}"><path d="${r.d}"/></clipPath>`)
    .join('');

  const regions = pic.regions
    .map((r) => {
      const clip = r.clip ? ` clip-path="url(#${clipId(r.clip)})"` : '';
      const spread = opts.interactive ? `<g class="region-spread" clip-path="url(#${clipId(r.id)})"></g>` : '';
      const group = `<g class="region" data-id="${r.id}"${clip}>
        <path class="region-fill" d="${r.d}" fill="${fills[r.id] ?? empty}"/>${spread}${line(r.d)}
      </g>`;
      const parent = outlineAfter.get(r.id);
      const over = parent
        ? `<g class="region-over" data-id="${parent}" pointer-events="none">${line(byId.get(parent)!.d)}</g>`
        : '';
      return group + over;
    })
    .join('');

  const head = opts.size
    ? `xmlns="http://www.w3.org/2000/svg" width="${opts.size}" height="${opts.size}"`
    : `class="picture-svg" aria-hidden="true"`;
  const dots = opts.dotted
    ? `<pattern id="${uid}-dots" width="14" height="14" patternUnits="userSpaceOnUse">
        <rect width="14" height="14" fill="${UNPAINTED}"/><circle cx="7" cy="7" r="1.5" fill="${INK}" opacity=".16"/>
      </pattern>`
    : '';
  return `<svg ${head} viewBox="0 0 400 400">
    <defs>
      ${dots}
      <clipPath id="${uid}-frame"><rect width="400" height="400" rx="20"/></clipPath>
      ${clips}
    </defs>
    <g clip-path="url(#${uid}-frame)">
      ${regions}
      <g class="deco" pointer-events="none">${pic.deco}</g>
    </g>
    <rect x="2.5" y="2.5" width="395" height="395" rx="18" fill="none" stroke="${INK}" stroke-width="5"/>
  </svg>`;
}

/** The fill of unpainted parts in a picture drawn with `dotted`. */
export function emptyFill(svg: SVGSVGElement) {
  const pattern = svg.querySelector('pattern');
  return pattern ? `url(#${pattern.id})` : UNPAINTED;
}
