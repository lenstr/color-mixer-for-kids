// Paint jar illustration.

import type { PaintInfo } from './data';
import { shade } from './color';

/**
 * Paint jar in three layers so the sloshing paint costs nothing to animate:
 * static glass behind, an HTML box clipped to the jar's inside with a wave
 * strip that only slides (a compositor transform), static gloss and outline
 * in front. Coordinates are in the 120×150 jar artboard.
 */
export function jarSVG(p: PaintInfo) {
  const dark = shade(p.hex, -0.22);
  const light = shade(p.hex, 0.35);
  // The wave repeats every 60 units; the strip is 136 wide (interior 76 + one period).
  const crest = 'q15 -9 30 0 t30 0 t30 0 t30 0 t30 0';
  return `
  <span class="jar-art" style="--paint:${p.hex}; --paint-dark:${dark}">
    <svg viewBox="0 0 120 150" class="jar-layer" aria-hidden="true">
      <ellipse cx="60" cy="144" rx="44" ry="6" fill="#2B2340" opacity=".16"/>
      <path d="M22 40 H98 V118 Q98 140 76 140 H44 Q22 140 22 118 Z" fill="#F3FBFF" opacity=".85"/>
    </svg>
    <span class="jar-paint">
      <span class="jar-wave">
        <svg viewBox="0 0 136 84" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 6 ${crest} V84 H0 Z" fill="${p.hex}"/>
          <path d="M0 6 ${crest}" fill="none" stroke="${light}" stroke-width="5" opacity=".9"/>
        </svg>
      </span>
    </span>
    <svg viewBox="0 0 120 150" class="jar-layer" aria-hidden="true">
      <rect x="30" y="50" width="9" height="76" rx="4.5" fill="#fff" opacity=".55"/>
      <rect x="44" y="50" width="4" height="40" rx="2" fill="#fff" opacity=".35"/>
      <path d="M22 40 H98 V118 Q98 140 76 140 H44 Q22 140 22 118 Z" fill="none" stroke="#2B2340" stroke-width="5" stroke-linejoin="round"/>
      <rect x="14" y="24" width="92" height="20" rx="9" fill="#FFFDF7" stroke="#2B2340" stroke-width="5"/>
      <path d="M70 26 h22 q4 0 4 4 v4 q0 6 -4 9 q-3 3 -3 9 v10 q0 7 -6.5 7 t-6.5 -7 v-6 q0 -6 -4 -9 q-6 -4 -6 -11 q0 -10 4 -10 z"
        fill="${p.hex}" stroke="#2B2340" stroke-width="4.5" stroke-linejoin="round"/>
      <ellipse cx="86" cy="54" rx="2" ry="4.5" fill="#fff" opacity=".6"/>
      <rect x="22" y="29" width="30" height="5" rx="2.5" fill="#fff"/>
    </svg>
  </span>`;
}

export function dropSVG(hex: string) {
  return `<svg viewBox="-20 -26 40 50" aria-hidden="true">
    <path d="M0 -22 C7 -11 15 -2 15 7 A15 15 0 0 1 -15 7 C-15 -2 -7 -11 0 -22 Z" fill="${hex}" stroke="#2B2340" stroke-width="3.5" stroke-linejoin="round"/>
    <ellipse cx="-6" cy="4" rx="3.2" ry="5.5" fill="#fff" opacity=".65" transform="rotate(20 -6 4)"/>
  </svg>`;
}
