// "Клякса" — the living paint blob. Jelly physics, a face that follows the
// pointer, and a swirl of the incoming paint whenever it eats a drop.

import { mixHexes } from './color';

const NS = 'http://www.w3.org/2000/svg';
const INK = '#2B2340';
export const EMPTY_COLOR = '#F4EBDC';
const GROUND = 78;

export type Mood = 'smile' | 'open' | 'happy' | 'yum' | 'hungry' | 'oops';

const MOUTH: Record<Mood, { d: string; fill: boolean }> = {
  smile: { d: 'M-17 20 Q0 34 17 20', fill: false },
  open: { d: 'M-11 24 C-11 10 11 10 11 24 C11 38 -11 38 -11 24 Z', fill: true },
  happy: { d: 'M-25 15 Q0 18 25 15 Q22 47 0 47 Q-22 47 -25 15 Z', fill: true },
  yum: { d: 'M-16 24 Q-8 16 0 24 Q8 32 16 24', fill: false },
  hungry: { d: 'M-7 26 C-7 19 7 19 7 26 C7 33 -7 33 -7 26 Z', fill: true },
  oops: { d: 'M-16 29 Q-8 20 0 27 Q8 34 16 25', fill: false },
};

let uid = 0;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

interface Swirl {
  g: SVGGElement;
  start: number;
}

export interface BlobOptions {
  face?: boolean;
  color?: string | null;
  seed?: number;
  /** pupils follow the pointer */
  look?: boolean;
}

export class PaintBlob {
  readonly svg: SVGSVGElement;
  private body: SVGPathElement;
  private clipShape: SVGPathElement;
  private squashG: SVGGElement;
  private swirlG: SVGGElement;
  private shadow: SVGEllipseElement;
  private face?: {
    root: SVGGElement;
    eyes: SVGGElement[];
    pupils: SVGGElement[];
    happyEyes: SVGGElement;
    mouth: SVGPathElement;
    tongue: SVGEllipseElement;
  };

  private color: string;
  private from: string;
  private to: string;
  private colorStart = 0;
  private colorDur = 650;

  private s = 0; // squash amount (+ tall, − flat)
  private v = 0;
  private wobble = 1;
  private shakeUntil = 0;
  private hop = 0;
  private hopV = 0;

  private mood: Mood = 'smile';
  private baseMood: Mood = 'smile';
  private moodTimer = 0;
  private nextBlink = 0;
  private blinkStart = -1;
  private look = { x: 0, y: 0, tx: 0, ty: 0 };

  private swirls: Swirl[] = [];
  private raf = 0;
  private seed: number;
  private onMove?: (e: PointerEvent) => void;
  private destroyed = false;

  constructor(opts: BlobOptions = {}) {
    const id = `blob${++uid}`;
    this.seed = opts.seed ?? Math.random() * 100;
    this.color = this.from = this.to = opts.color ?? EMPTY_COLOR;

    this.svg = el('svg', { viewBox: '-150 -140 300 250', class: 'paint-blob' });
    const defs = el('defs');
    const clip = el('clipPath', { id: `${id}-clip` });
    this.clipShape = el('path');
    clip.append(this.clipShape);

    const shadeGrad = el('radialGradient', { id: `${id}-shade`, cx: '38%', cy: '30%', r: '75%' });
    shadeGrad.append(
      el('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': 0.28 }),
      el('stop', { offset: '0.45', 'stop-color': '#fff', 'stop-opacity': 0 }),
      el('stop', { offset: '0.8', 'stop-color': '#000', 'stop-opacity': 0.06 }),
      el('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': 0.24 }),
    );
    defs.append(clip, shadeGrad);
    this.svg.append(defs);

    this.shadow = el('ellipse', { cx: 0, cy: GROUND + 4, rx: 96, ry: 12, fill: INK, opacity: 0.14 });
    this.svg.append(this.shadow);

    this.squashG = el('g');
    this.body = el('path', { fill: this.color });
    this.swirlG = el('g');
    const inner = el('g', { 'clip-path': `url(#${id}-clip)` });
    inner.append(
      this.swirlG,
      el('rect', { x: -150, y: -150, width: 300, height: 300, fill: `url(#${id}-shade)` }),
      // glossy highlights
      el('ellipse', { cx: -48, cy: -52, rx: 24, ry: 11, fill: '#fff', opacity: 0.6, transform: 'rotate(-38 -48 -52)' }),
      el('circle', { cx: -22, cy: -72, r: 5.5, fill: '#fff', opacity: 0.6 }),
      el('path', { d: 'M62 30 Q74 6 66 -18', stroke: '#fff', 'stroke-width': 6, 'stroke-linecap': 'round', fill: 'none', opacity: 0.25 }),
    );
    const outline = el('path', { fill: 'none', stroke: INK, 'stroke-width': 6.5, 'stroke-linejoin': 'round' });
    outline.classList.add('blob-outline');
    this.squashG.append(this.body, inner, outline);
    this.svg.append(this.squashG);
    this.outline = outline;

    if (opts.face !== false) this.buildFace();
    if (opts.look !== false && opts.face !== false) {
      this.onMove = (e) => this.lookAt(e.clientX, e.clientY);
      window.addEventListener('pointermove', this.onMove);
    }

    this.nextBlink = performance.now() + 1500 + Math.random() * 2000;
    this.raf = requestAnimationFrame(this.frame);
  }

  private outline: SVGPathElement;

  private buildFace() {
    const root = el('g', { class: 'blob-face' });
    const eyes: SVGGElement[] = [];
    const pupils: SVGGElement[] = [];
    for (const x of [-34, 34]) {
      const eye = el('g');
      eye.append(el('ellipse', { cx: x, cy: -18, rx: 17, ry: 20, fill: '#fff', stroke: INK, 'stroke-width': 5 }));
      const pupil = el('g');
      pupil.append(
        el('circle', { cx: x, cy: -16, r: 9.5, fill: INK }),
        el('circle', { cx: x + 3.5, cy: -20.5, r: 3.4, fill: '#fff' }),
      );
      eye.append(pupil);
      eyes.push(eye);
      pupils.push(pupil);
      root.append(eye);
    }
    const happyEyes = el('g', { opacity: 0 });
    for (const x of [-34, 34]) {
      happyEyes.append(
        el('path', {
          d: `M${x - 14} -12 Q${x} -34 ${x + 14} -12`,
          fill: 'none',
          stroke: INK,
          'stroke-width': 6,
          'stroke-linecap': 'round',
        }),
      );
    }
    root.append(happyEyes);
    for (const x of [-60, 60]) {
      root.append(el('ellipse', { cx: x, cy: 10, rx: 13, ry: 8, fill: '#FF5F8F', opacity: 0.38 }));
    }
    const tongue = el('ellipse', { cx: 4, cy: 40, rx: 11, ry: 7, fill: '#FF7A9A', opacity: 0 });
    const mouth = el('path', {
      stroke: INK,
      'stroke-width': 5.5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    root.append(mouth, tongue);
    this.squashG.append(root);
    this.face = { root, eyes, pupils, happyEyes, mouth, tongue };
    this.applyMood();
  }

  // ---------- public API ----------

  get currentColor() {
    return this.to;
  }

  setColor(hex: string | null, { animate = true, duration = 650 } = {}) {
    const target = hex ?? EMPTY_COLOR;
    this.from = this.color;
    this.to = target;
    this.colorDur = duration;
    this.colorStart = animate ? performance.now() : -Infinity;
    if (!animate) this.color = target;
  }

  /** Idle expression the blob returns to after reactions. */
  setBaseMood(m: Mood) {
    this.baseMood = m;
    if (!this.moodTimer) {
      this.mood = m;
      this.applyMood();
    }
  }

  react(m: Mood, ms = 900) {
    this.mood = m;
    this.applyMood();
    clearTimeout(this.moodTimer);
    this.moodTimer = window.setTimeout(() => {
      this.moodTimer = 0;
      this.mood = this.baseMood;
      this.applyMood();
    }, ms);
  }

  /** Mouth open, waiting for a drop to land. */
  expect() {
    this.react('open', 1200);
  }

  /** A drop of `dropHex` lands; the body becomes `newHex`. */
  eat(dropHex: string, newHex: string | null) {
    this.v -= 5.2;
    this.addSwirl(dropHex);
    this.setColor(newHex, { duration: 900 });
    this.react('yum', 650);
  }

  jump() {
    this.hopV = -620;
    this.v += 4;
  }

  shake() {
    this.shakeUntil = performance.now() + 500;
    this.react('oops', 900);
  }

  wiggle(strength = 3) {
    this.v += strength;
  }

  /** Mouth position in page coordinates — where drops should fly. */
  mouthPoint() {
    const r = this.svg.getBoundingClientRect();
    const sx = r.width / 300;
    const sy = r.height / 250;
    return { x: r.left + 150 * sx, y: r.top + (140 + 18) * sy };
  }

  lookAt(px: number, py: number) {
    const r = this.svg.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * 0.45;
    const dx = px - cx;
    const dy = py - cy;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 300);
    this.look.tx = (dx / d) * 6.5 * k;
    this.look.ty = (dy / d) * 6.5 * k;
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.moodTimer);
    if (this.onMove) window.removeEventListener('pointermove', this.onMove);
  }

  // ---------- internals ----------

  private applyMood() {
    if (!this.face) return;
    const m = MOUTH[this.mood];
    const f = this.face;
    f.mouth.setAttribute('d', m.d);
    f.mouth.setAttribute('fill', m.fill ? '#3B1C2E' : 'none');
    f.tongue.setAttribute('opacity', this.mood === 'happy' ? '1' : '0');
    const happy = this.mood === 'happy';
    f.happyEyes.setAttribute('opacity', happy ? '1' : '0');
    for (const e of f.eyes) e.setAttribute('opacity', happy ? '0' : '1');
  }

  private addSwirl(hex: string) {
    const g = el('g');
    let d = '';
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI * 3.4;
      const r = 4 + a * 15;
      d += `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
    }
    g.append(
      el('path', { d, fill: 'none', stroke: hex, 'stroke-width': 22, 'stroke-linecap': 'round' }),
      el('circle', { r: 26, fill: hex }),
    );
    this.swirlG.append(g);
    this.swirls.push({ g, start: performance.now() });
  }

  private frame = (now: number) => {
    if (this.destroyed) return;
    const dt = 1 / 60;
    const t = now / 1000;

    // jelly spring
    const a = -190 * this.s - 11 * this.v;
    this.v += a * dt;
    this.s += this.v * dt;
    // hop
    this.hopV += 2400 * dt;
    this.hop += this.hopV * dt;
    if (this.hop > 0) {
      if (this.hopV > 300) this.v -= this.hopV / 260; // land squish
      this.hop = 0;
      this.hopV = 0;
    }

    const breath = Math.sin(t * 2.2 + this.seed) * 0.018;
    const sq = Math.max(-0.45, Math.min(0.45, this.s + breath));
    const sx = 1 - sq * 0.55;
    const sy = 1 + sq;
    let shakeX = 0;
    if (now < this.shakeUntil) shakeX = Math.sin(now / 22) * 9 * ((this.shakeUntil - now) / 500);

    this.squashG.setAttribute(
      'transform',
      `translate(${shakeX.toFixed(2)} ${(this.hop - GROUND * (sy - 1)).toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})`,
    );
    const lift = Math.min(1, -this.hop / 140);
    this.shadow.setAttribute('rx', String(96 * sx * (1 - lift * 0.35)));
    this.shadow.setAttribute('opacity', String(0.14 * (1 - lift * 0.5)));

    // outline
    const d = this.shapePath(t);
    this.body.setAttribute('d', d);
    this.clipShape.setAttribute('d', d);
    this.outline.setAttribute('d', d);

    // color fade
    if (this.color !== this.to) {
      const p = Math.min(1, (now - this.colorStart) / this.colorDur);
      const e = 1 - (1 - p) ** 3;
      this.color = p >= 1 ? this.to : mixHexes(this.from, this.to, e);
      this.body.setAttribute('fill', this.color);
    }

    // swirls
    for (const s of this.swirls) {
      const p = (now - s.start) / 1100;
      const e = 1 - (1 - Math.min(1, p)) ** 2;
      s.g.setAttribute('transform', `translate(0 -14) rotate(${(e * 260).toFixed(1)}) scale(${(0.25 + e * 1.1).toFixed(3)})`);
      s.g.setAttribute('opacity', String(Math.max(0, 1 - p ** 1.6)));
    }
    this.swirls = this.swirls.filter((s) => {
      if (now - s.start > 1100) {
        s.g.remove();
        return false;
      }
      return true;
    });

    // face
    if (this.face) {
      this.look.x += (this.look.tx - this.look.x) * 0.12;
      this.look.y += (this.look.ty - this.look.y) * 0.12;
      for (const p of this.face.pupils) p.setAttribute('transform', `translate(${this.look.x.toFixed(2)} ${this.look.y.toFixed(2)})`);
      if (now > this.nextBlink && this.blinkStart < 0) this.blinkStart = now;
      if (this.blinkStart >= 0) {
        const p = (now - this.blinkStart) / 160;
        const k = p >= 1 ? 1 : Math.max(0.08, Math.abs(1 - p * 2));
        this.face.eyes.forEach((e, i) => {
          const cx = i ? 34 : -34;
          e.setAttribute('transform', `translate(${cx} -18) scale(1 ${k.toFixed(3)}) translate(${-cx} 18)`);
        });
        if (p >= 1) {
          this.blinkStart = -1;
          this.nextBlink = now + 2200 + Math.random() * 3200;
        }
      }
      this.face.root.setAttribute('transform', `translate(${(this.look.x * 0.6).toFixed(2)} ${(this.look.y * 0.4).toFixed(2)})`);
    }

    this.raf = requestAnimationFrame(this.frame);
  };

  private shapePath(t: number) {
    const N = 9;
    const pts: [number, number][] = [];
    const w = this.wobble;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
      const r =
        104 *
        (1 +
          w * 0.032 * Math.sin(t * 1.6 + i * 1.9 + this.seed) +
          w * 0.022 * Math.sin(t * 2.7 + i * 3.1 + this.seed * 2));
      let x = Math.cos(ang) * r * 1.06;
      let y = Math.sin(ang) * r - 6;
      // sit on the ground: flatten the bottom
      if (y > 58) y = 58 + (y - 58) * 0.42;
      if (y > 40) x *= 1.04;
      pts.push([x, y]);
    }
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < N; i++) {
      const p0 = pts[(i - 1 + N) % N];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % N];
      const p3 = pts[(i + 2) % N];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d + 'Z';
  }
}

/** Static blob silhouette path for swatches/stickers (seeded, deterministic). */
export function staticBlobPath(seed: number, r = 40) {
  const N = 8;
  const pts: [number, number][] = [];
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = r * (0.88 + rnd() * 0.22);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

/** Small decorative blob swatch with gloss, as an SVG string. */
export function swatchSVG(hex: string | null, seed: number, { face = false, cls = '' } = {}) {
  const d = staticBlobPath(seed);
  const fill = hex ?? 'none';
  const dashed = hex ? '' : 'stroke-dasharray="7 7"';
  const eyes = face
    ? `<g class="mini-face"><ellipse cx="-11" cy="-4" rx="5.5" ry="6.5" fill="#fff" stroke="${INK}" stroke-width="2.6"/><ellipse cx="11" cy="-4" rx="5.5" ry="6.5" fill="#fff" stroke="${INK}" stroke-width="2.6"/><circle cx="-10" cy="-3" r="3" fill="${INK}"/><circle cx="12" cy="-3" r="3" fill="${INK}"/><path d="M-6 8 Q0 13 6 8" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/></g>`
    : '';
  return `<svg viewBox="-50 -50 100 100" class="swatch ${cls}" aria-hidden="true">
    <path d="${d}" fill="${fill}" stroke="${hex ? INK : 'currentColor'}" stroke-width="4.5" ${dashed} stroke-linejoin="round"/>
    ${hex ? `<ellipse cx="-17" cy="-19" rx="9" ry="4.5" fill="#fff" opacity=".55" transform="rotate(-38 -17 -19)"/><circle cx="-6" cy="-28" r="2.2" fill="#fff" opacity=".6"/>` : ''}
    ${eyes}
  </svg>`;
}
