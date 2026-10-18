// "Клякса" — the living paint blob. Jelly physics, a face that follows the
// pointer, and a swirl of the incoming paint whenever it eats a drop.
//
// The simulation lives here; a WebGL2 shader draws it (gl-view.ts).

import { mixHexes } from '../color';
import { onFrame } from '../render/ticker';
import { type BlobFrame, type Mood, EMPTY_COLOR, GROUND, INK, controlRadii } from './shape';
import { GlBlobView } from './gl-view';

export { EMPTY_COLOR, type Mood };

export interface BlobOptions {
  face?: boolean;
  color?: string | null;
  seed?: number;
  /** pupils follow the pointer */
  look?: boolean;
}

const SWIRL_MS = 1100;

export class PaintBlob {
  /** The element to put on the page; sized like a 300×250 box. */
  readonly el: HTMLElement;
  private view: GlBlobView;
  private face: boolean;
  private seed: number;

  private color: string;
  private from: string;
  private to: string;
  private colorStart = 0;
  private colorDur = 650;

  private s = 0; // squash amount (+ tall, − flat)
  private v = 0;
  private shakeUntil = 0;
  private hop = 0;
  private hopV = 0;

  private mood: Mood = 'smile';
  private baseMood: Mood = 'smile';
  private moodTimer = 0;
  private nextBlink = 0;
  private blinkStart = -1;
  private blink = 1;
  private look = { x: 0, y: 0, tx: 0, ty: 0 };
  private swirls: { color: string; start: number }[] = [];

  private stop: () => void;
  private paused = false;
  private onMove?: (e: PointerEvent) => void;

  constructor(opts: BlobOptions = {}) {
    this.face = opts.face !== false;
    this.seed = opts.seed ?? Math.random() * 100;
    this.color = this.from = this.to = opts.color ?? EMPTY_COLOR;
    this.view = new GlBlobView(this.face);
    this.el = this.view.el;
    if (opts.look !== false && this.face) {
      this.onMove = (e) => this.lookAt(e.clientX, e.clientY);
      window.addEventListener('pointermove', this.onMove);
    }
    this.nextBlink = performance.now() + 1500 + Math.random() * 2000;
    this.stop = onFrame((now, dt) => this.frame(now, dt));
  }

  // ---------- public API ----------

  get currentColor() {
    return this.to;
  }

  setColor(hex: string | null, { animate = true, duration = 650 } = {}) {
    this.from = this.color;
    this.to = hex ?? EMPTY_COLOR;
    this.colorDur = duration;
    this.colorStart = animate ? performance.now() : -Infinity;
    if (!animate) this.color = this.to;
  }

  /** Idle expression the blob returns to after reactions. */
  setBaseMood(m: Mood) {
    this.baseMood = m;
    if (!this.moodTimer) this.mood = m;
  }

  react(m: Mood, ms = 900) {
    this.mood = m;
    clearTimeout(this.moodTimer);
    this.moodTimer = window.setTimeout(() => {
      this.moodTimer = 0;
      this.mood = this.baseMood;
    }, ms);
  }

  /** Mouth open, waiting for a drop to land. */
  expect() {
    this.react('open', 1200);
  }

  /** A drop of `dropHex` lands; the body becomes `newHex`. */
  eat(dropHex: string, newHex: string | null) {
    this.v -= 5.2;
    this.swirls.push({ color: dropHex, start: performance.now() });
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

  /** Freeze the animation (e.g. while a dialog covers the blob). */
  pause(p = true) {
    this.paused = p;
  }

  /** Mouth position in page coordinates — where drops should fly. */
  mouthPoint() {
    const r = this.el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + (158 / 250) * r.height };
  }

  lookAt(px: number, py: number) {
    const r = this.el.getBoundingClientRect();
    const dx = px - (r.left + r.width / 2);
    const dy = py - (r.top + r.height * 0.45);
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 300);
    this.look.tx = (dx / d) * 6.5 * k;
    this.look.ty = (dy / d) * 6.5 * k;
  }

  destroy() {
    this.stop();
    clearTimeout(this.moodTimer);
    if (this.onMove) window.removeEventListener('pointermove', this.onMove);
    this.view.destroy();
  }

  // ---------- simulation ----------

  private frame(now: number, dt: number) {
    if (this.paused) return;
    const t = now / 1000;

    // jelly spring
    this.v += (-190 * this.s - 11 * this.v) * dt;
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
    const shakeX = now < this.shakeUntil ? Math.sin(now / 22) * 9 * ((this.shakeUntil - now) / 500) : 0;
    const lift = Math.min(1, -this.hop / 140);

    if (this.color !== this.to) {
      const p = Math.min(1, (now - this.colorStart) / this.colorDur);
      this.color = p >= 1 ? this.to : mixHexes(this.from, this.to, 1 - (1 - p) ** 3);
    }

    this.swirls = this.swirls.filter((s) => now - s.start < SWIRL_MS);
    const swirls = this.swirls.map((s) => {
      const p = (now - s.start) / SWIRL_MS;
      const e = 1 - (1 - p) ** 2;
      return { color: s.color, rot: (e * 260 * Math.PI) / 180, scale: 0.25 + e * 1.1, opacity: Math.max(0, 1 - p ** 1.6) };
    });

    const ease = 1 - Math.exp(-dt * 7.5); // ≈0.12 per 60 Hz frame
    this.look.x += (this.look.tx - this.look.x) * ease;
    this.look.y += (this.look.ty - this.look.y) * ease;
    if (now > this.nextBlink && this.blinkStart < 0) this.blinkStart = now;
    this.blink = 1;
    if (this.blinkStart >= 0) {
      const p = (now - this.blinkStart) / 160;
      this.blink = p >= 1 ? 1 : Math.max(0.08, Math.abs(1 - p * 2));
      if (p >= 1) {
        this.blinkStart = -1;
        this.nextBlink = now + 2200 + Math.random() * 3200;
      }
    }

    const f: BlobFrame = {
      radii: controlRadii(t, this.seed),
      sx,
      sy,
      tx: shakeX,
      ty: this.hop - GROUND * (sy - 1),
      shadowRx: 96 * sx * (1 - lift * 0.35),
      shadowOpacity: 0.14 * (1 - lift * 0.5),
      color: this.color,
      swirls,
      look: { x: this.look.x, y: this.look.y },
      blink: this.blink,
      mood: this.mood,
      face: this.face,
    };
    this.view.draw(f);
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
