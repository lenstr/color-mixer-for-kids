// Draws a coloring page as SVG markup: the painting screen, the gallery
// thumbnails and the PNG export all use the same drawing.

import type { Picture } from './pictures';

export const UNPAINTED = '#FFFDF7';
const INK = '#2B2340';

let uidSeq = 0;

export interface PictureSVGOptions {
  /** fill for regions not painted yet; the screen uses a dotted pattern */
  empty?: string;
  /** standalone file with xmlns and a pixel size, for the PNG export */
  size?: number;
  cls?: string;
}

/**
 * Each region is a group of its fill, an empty layer that paint spreads into
 * (clipped to the region) and its outline. Ids are unique per call, so many
 * pictures can share a page.
 */
export function pictureSVG(pic: Picture, fills: Record<string, string>, opts: PictureSVGOptions = {}) {
  const uid = `pic${++uidSeq}`;
  const empty = opts.empty ?? UNPAINTED;
  const clipId = (rid: string) => `${uid}-${rid}`;
  const clips = pic.regions.map((r) => `<clipPath id="${clipId(r.id)}"><path d="${r.d}"/></clipPath>`).join('');
  const regions = pic.regions
    .map((r) => {
      const clip = r.clip ? ` clip-path="url(#${clipId(r.clip)})"` : '';
      return `<g class="region" data-id="${r.id}"${clip}>
        <path class="region-fill" d="${r.d}" fill="${fills[r.id] ?? empty}"/>
        <g class="region-spread" clip-path="url(#${clipId(r.id)})"></g>
        <path class="region-line" d="${r.d}" fill="none" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
      </g>`;
    })
    .join('');
  const head = opts.size
    ? `xmlns="http://www.w3.org/2000/svg" width="${opts.size}" height="${opts.size}"`
    : `class="picture-svg ${opts.cls ?? ''}" aria-hidden="true"`;
  return `<svg ${head} viewBox="0 0 400 400">
    <defs>
      <pattern id="${uid}-dots" width="14" height="14" patternUnits="userSpaceOnUse">
        <rect width="14" height="14" fill="${UNPAINTED}"/><circle cx="7" cy="7" r="1.5" fill="${INK}" opacity=".16"/>
      </pattern>
      <clipPath id="${uid}-frame"><rect width="400" height="400" rx="20"/></clipPath>
      ${clips}
    </defs>
    <g clip-path="url(#${uid}-frame)">
      ${regions.replaceAll('fill="dots"', `fill="url(#${uid}-dots)"`)}
      <g class="deco" pointer-events="none">${pic.deco}</g>
    </g>
    <rect x="2.5" y="2.5" width="395" height="395" rx="18" fill="none" stroke="${INK}" stroke-width="5"/>
  </svg>`;
}

/** Fill value that draws the dotted "not painted yet" pattern. */
export const DOTS = 'dots';
