// Paint effects shared by the mixer and the coloring page: a drop flying
// along an arc and a splash where it lands. Both are DOM nodes moved by
// compositor transforms and removed when their animation ends.

import { dropSVG } from './jar';
import { html } from './ui';

export interface Point {
  x: number;
  y: number;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The point a drop leaves a jar from, in page coordinates. */
export function jarMouth(jar: HTMLElement): Point {
  const r = jar.querySelector('.jar-art')!.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.12 };
}

/** Flies a drop of `hex` from `start` to `end` along an arc, then calls `done`. */
export function flyDrop(start: Point, end: Point, hex: string, done: () => void, duration = 560) {
  const d = html(`<div class="flying-drop">${dropSVG(hex)}</div>`);
  document.body.append(d);
  const apex = Math.min(start.y, end.y) - Math.max(90, Math.abs(start.x - end.x) * 0.25);
  const ctrl = { x: (start.x + end.x) / 2, y: apex };
  const frames: Keyframe[] = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = (1 - t) ** 2 * start.x + 2 * (1 - t) * t * ctrl.x + t * t * end.x;
    const y = (1 - t) ** 2 * start.y + 2 * (1 - t) * t * ctrl.y + t * t * end.y;
    const vx = 2 * (1 - t) * (ctrl.x - start.x) + 2 * t * (end.x - ctrl.x);
    const vy = 2 * (1 - t) * (ctrl.y - start.y) + 2 * t * (end.y - ctrl.y);
    const rot = (Math.atan2(-vx, vy) * 180) / Math.PI + 180;
    const sc = 0.6 + Math.sin(t * Math.PI) * 0.5;
    frames.push({ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rot}deg) scale(${sc})` });
  }
  const anim = d.animate(frames, { duration: reduced() ? 200 : duration, easing: 'cubic-bezier(.3,.1,.6,1)' });
  anim.onfinish = () => {
    d.remove();
    done();
  };
}

/** A burst of paint dots around `at`. */
export function splash(at: Point, hex: string, count = 9) {
  for (let i = 0; i < count; i++) {
    const s = html(`<i class="splash-dot" style="--c:${hex}"></i>`);
    document.body.append(s);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
    const v = 50 + Math.random() * 70;
    const size = 8 + Math.random() * 10;
    s.style.width = s.style.height = `${size}px`;
    s.animate(
      [
        { transform: `translate(${at.x}px, ${at.y}px) translate(-50%,-50%) scale(1)`, opacity: 1 },
        {
          transform: `translate(${at.x + Math.cos(a) * v}px, ${at.y + Math.sin(a) * v + 30}px) translate(-50%,-50%) scale(.2)`,
          opacity: 0,
        },
      ],
      { duration: 520, easing: 'cubic-bezier(.2,.7,.4,1)' },
    ).onfinish = () => s.remove();
  }
}

/** Removes drops and splashes still in flight, when their screen goes away. */
export function clearEffects() {
  document.querySelectorAll('.flying-drop, .splash-dot').forEach((n) => n.remove());
}
