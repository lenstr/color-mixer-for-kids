// The hedgehog's glade, which Кляксын drained of its colors: a coloring
// page painted in the task mode, without hints, to win the gold paint.

import { type Picture, SKY, circle, dot, ellipse, gloss, grass, line, n, rays, rect } from '../coloring/pictures';
import { INK } from '../palette';
import { hedgehogPaths } from './characters';

/** A cloud: a flat bottom with three bumps on top. */
function cloud(cx: number, cy: number, s = 1) {
  const p = (x: number, y: number) => `${n(cx + x * s)} ${n(cy + y * s)}`;
  return `M${p(-50, 18)}A${20 * s} ${20 * s} 0 0 1 ${p(-34, -10)}A${26 * s} ${26 * s} 0 0 1 ${p(12, -20)}A${22 * s} ${22 * s} 0 0 1 ${p(48, 4)}A${14 * s} ${14 * s} 0 0 1 ${p(44, 18)}Z`;
}

/** A flower head with `k` round petals around (cx, cy). */
function flower(cx: number, cy: number, R: number, k = 5) {
  const r0 = R * 0.6;
  const pt = (i: number) => {
    const a = ((i * 360) / k - 90) * (Math.PI / 180);
    return `${n(cx + Math.cos(a) * r0)} ${n(cy + Math.sin(a) * r0)}`;
  };
  let d = `M${pt(0)}`;
  for (let i = 1; i <= k; i++) d += `A${n(R * 0.42)} ${n(R * 0.42)} 0 1 1 ${pt(i)}`;
  return d + 'Z';
}

/** The hedgehog of the story, half size, standing on the grass. */
const hedgehog = hedgehogPaths((x, y) => `${n(150 + x * 0.5)} ${n(232 + y * 0.5)}`);

export const GLADE: Picture = {
  id: 'glade',
  name: 'Полянка ёжика',
  acc: 'полянку ёжика',
  regions: [
    { id: 'sky', target: 'skyblue', d: SKY },
    { id: 'sun', target: 'yellow', d: circle(334, 70, 34) },
    { id: 'cloud1', target: 'white', d: cloud(118, 66) },
    { id: 'cloud2', target: 'white', d: cloud(236, 114, 0.7) },
    { id: 'hills', target: 'darkgreen', d: 'M0 236C60 194 132 194 196 228C256 196 336 188 400 222V400H0Z' },
    { id: 'grass', target: 'green', d: 'M0 284C110 264 290 264 400 284V400H0Z' },
    { id: 'trunk', target: 'brown', d: 'M58 304C64 266 64 230 58 200H92C86 230 86 266 94 304Z' },
    { id: 'crown', target: 'green', d: ellipse(76, 160, 62, 56) },
    { id: 'apple1', target: 'red', d: circle(52, 146, 10), clip: 'crown' },
    { id: 'apple2', target: 'red', d: circle(100, 178, 10), clip: 'crown' },
    { id: 'apple3', target: 'red', d: circle(90, 124, 9), clip: 'crown' },
    { id: 'hedgehog', target: 'peach', d: hedgehog.body },
    { id: 'spikes', target: 'brown', d: hedgehog.back },
    { id: 'petals1', target: 'pink', d: flower(54, 352, 26) },
    { id: 'middle1', target: 'yellow', d: circle(54, 352, 8) },
    { id: 'petals2', target: 'purple', d: flower(126, 374, 22) },
    { id: 'middle2', target: 'yellow', d: circle(126, 374, 7) },
    { id: 'petals3', target: 'red', d: flower(318, 346, 24) },
    { id: 'middle3', target: 'yellow', d: circle(318, 346, 8) },
    { id: 'stem', target: 'peach', d: rect(362, 362, 20, 28, 6) },
    { id: 'cap', target: 'red', d: 'M344 368C344 336 400 336 400 368Z' },
  ],
  deco:
    rays(334, 70, 44, 60, 10) +
    gloss('M64 124C70 114 82 108 94 108', 9) +
    // the hedgehog's eye, cheek, nose, smile, feet and needles
    `<ellipse cx="248" cy="302" rx="4.5" ry="5.5" fill="${INK}"/>` +
    dot(249.5, 300, 1.7, '#fff') +
    `<ellipse cx="252" cy="315" rx="6.5" ry="4" fill="#FF98A7" opacity=".75"/>` +
    dot(276, 308, 5) +
    line('M257 320Q263 325 269 319', 3.5) +
    line('M185 293l7 -9M202 286l4 -11M220 285l1 -11', 3.5) +
    `<ellipse cx="203" cy="336" rx="9" ry="5.5" fill="#F6C9A0" stroke="${INK}" stroke-width="4"/>` +
    `<ellipse cx="235" cy="336" rx="9" ry="5.5" fill="#F6C9A0" stroke="${INK}" stroke-width="4"/>` +
    // mushroom spots and flower stems
    dot(360, 352, 4.5, '#fff') +
    dot(380, 346, 5.5, '#fff') +
    line('M54 378V400M126 396V400M318 370V392', 4) +
    grass([18, 160, 270, 384], 300) +
    grass([92, 210, 352], 394),
};
