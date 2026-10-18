// Paint jar illustration.

import type { PaintInfo } from './data';
import { shade } from './color';

let n = 0;

export function jarSVG(p: PaintInfo) {
  const id = `jar${++n}`;
  const dark = shade(p.hex, -0.22);
  const light = shade(p.hex, 0.35);
  return `
  <svg viewBox="0 0 120 150" class="jar-svg" aria-hidden="true">
    <defs>
      <clipPath id="${id}-in"><path d="M22 40 H98 V118 Q98 140 76 140 H44 Q22 140 22 118 Z"/></clipPath>
      <linearGradient id="${id}-paint" x1="0" x2="1">
        <stop offset="0" stop-color="${p.hex}"/>
        <stop offset=".7" stop-color="${p.hex}"/>
        <stop offset="1" stop-color="${dark}"/>
      </linearGradient>
    </defs>
    <ellipse cx="60" cy="144" rx="44" ry="6" fill="#2B2340" opacity=".16"/>
    <!-- glass -->
    <path d="M22 40 H98 V118 Q98 140 76 140 H44 Q22 140 22 118 Z" fill="#F3FBFF" opacity=".85"/>
    <g clip-path="url(#${id}-in)">
      <g class="jar-wave">
        <path d="M-60 66 q15 -9 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V150 H-60 Z" fill="url(#${id}-paint)"/>
        <path d="M-60 66 q15 -9 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0" fill="none" stroke="${light}" stroke-width="5" opacity=".9"/>
      </g>
      <rect x="30" y="50" width="9" height="76" rx="4.5" fill="#fff" opacity=".55"/>
      <rect x="44" y="50" width="4" height="40" rx="2" fill="#fff" opacity=".35"/>
    </g>
    <path d="M22 40 H98 V118 Q98 140 76 140 H44 Q22 140 22 118 Z" fill="none" stroke="#2B2340" stroke-width="5" stroke-linejoin="round"/>
    <!-- rim -->
    <rect x="14" y="24" width="92" height="20" rx="9" fill="#FFFDF7" stroke="#2B2340" stroke-width="5"/>
    <!-- paint dripping over the rim -->
    <path d="M70 26 h22 q4 0 4 4 v4 q0 6 -4 9 q-3 3 -3 9 v10 q0 7 -6.5 7 t-6.5 -7 v-6 q0 -6 -4 -9 q-6 -4 -6 -11 q0 -10 4 -10 z"
      fill="${p.hex}" stroke="#2B2340" stroke-width="4.5" stroke-linejoin="round"/>
    <ellipse cx="86" cy="54" rx="2" ry="4.5" fill="#fff" opacity=".6"/>
    <rect x="22" y="29" width="30" height="5" rx="2.5" fill="#fff"/>
  </svg>`;
}

export function dropSVG(hex: string) {
  return `<svg viewBox="-20 -26 40 50" aria-hidden="true">
    <path d="M0 -22 C7 -11 15 -2 15 7 A15 15 0 0 1 -15 7 C-15 -2 -7 -11 0 -22 Z" fill="${hex}" stroke="#2B2340" stroke-width="3.5" stroke-linejoin="round"/>
    <ellipse cx="-6" cy="4" rx="3.2" ry="5.5" fill="#fff" opacity=".65" transform="rotate(20 -6 4)"/>
  </svg>`;
}
