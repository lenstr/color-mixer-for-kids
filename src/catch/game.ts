// «Поймай цвет»: paint drops fall from white clouds, Клякса catches them in a
// bucket held over its head, and the bucket mixes them like the mixer does.
// The bucket must reach the target's recipe × MULT exactly: a drop that does
// not fit (or mud) spoils the bucket and costs a life. The game draws itself
// on a 2D canvas and reports what happens through `on`; the screen around it
// plays the sounds and voice and keeps the record.

import { type Drops, type Pigment, PIGMENTS, emptyDrops, mixHex, totalDrops } from '../color';
import { COLOR_BY_ID, MIX_COLORS, type NamedColor, PAINT_BY_ID, colorLabel } from '../data';

// The drops that fall, all of them on every level. A mixed drop pours its
// whole recipe into the bucket: a green one is one yellow and one blue.
const DROPS = (
  [
    ['red', 'Красная'],
    ['yellow', 'Жёлтая'],
    ['blue', 'Синяя'],
    ['green', 'Зелёная'],
    ['pink', 'Розовая'],
    ['skyblue', 'Голубая'],
    ['black', 'Чёрная'],
    ['purple', 'Фиолетовая'],
  ] as const
).map(([id, name]) => ({ id, name, recipe: COLOR_BY_ID[id].recipe, hex: COLOR_BY_ID[id].hex }));
type Paint = (typeof DROPS)[number];
type Kind = Paint | 'mud';

// Balance, tuned in a throwaway prototype.
const FALL = 0.32; // share of the sky crossed per second at level 1
const FALL_GROWTH = 0.06; // per level
const SPAWN = 0.85; // seconds between drops at level 1
const SPAWN_GROWTH = 0.04; // per level
const MUD = 0.12; // share of mud drops
const HELP = 0.15; // extra chance that a drop is one the bucket can still take
const BUCKET = 0.2; // bucket width, share of the playfield
const BUCKET_SPEED = 1.8; // playfield widths per second
const MULT = 2; // the bucket holds the recipe × MULT
export const LIVES = 3;
const CLOUDS = 4;
const TREMBLE = 0.35; // seconds a cloud shakes before it lets a drop go
const WON_PAUSE = 1.6; // seconds between a full bucket and the next color
const MOUSE_EVERY = 40; // seconds between visits of the mouse with the mop

const MUD_HEX = '#6B4A2B';
const BLOB = '#9B6BF2';
const INK = '#2B2340';
const FONT = 'Nunito, system-ui, sans-serif';

/** Can the drops add up to exactly this recipe × MULT? Gray needs pure white, so no. */
function reachable(c: NamedColor) {
  const rest = PIGMENTS.map((p) => c.recipe[p] * MULT);
  const fill = (from: number): boolean => {
    if (rest.every((n) => n === 0)) return true;
    for (let i = from; i < DROPS.length; i++) {
      const r = PIGMENTS.map((p) => DROPS[i].recipe[p]);
      if (r.some((n, j) => n > rest[j])) continue;
      r.forEach((n, j) => (rest[j] -= n));
      const ok = fill(i);
      r.forEach((n, j) => (rest[j] += n));
      if (ok) return true;
    }
    return false;
  };
  return fill(0);
}

/** The colors to catch, in the mixer's level order. */
export const TARGETS = MIX_COLORS.filter(reachable);

export type CatchEvent =
  | { type: 'level'; target: NamedColor; first: boolean }
  | { type: 'catch'; combo: number }
  | { type: 'spoil'; why: 'mud' | 'extra'; over: boolean }
  | { type: 'pour' }
  | { type: 'win'; target: NamedColor; next: NamedColor }
  | { type: 'over'; score: number }
  | { type: 'mouse' };

export interface CatchOptions {
  on(e: CatchEvent): void;
  /** the best score so far, read when the game ends */
  best(): number;
  /** no screen shake */
  calm: boolean;
}

interface Drop { kind: Kind; x: number; y: number; r: number; wob: number }
interface Cloud { slot: number; x: number; release: number; next: Kind | null }
interface Splat { x: number; y: number; r: number; hex: string; seed: number }
interface Particle { x: number; y: number; vx: number; vy: number; hex: string; t: number; r: number }
interface Float { x: number; y: number; text: string; hex: string; t: number; big: boolean }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const any = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

export function catchGame(canvas: HTMLCanvasElement, opts: CatchOptions) {
  const ctx = canvas.getContext('2d')!;

  let phase: 'start' | 'play' | 'won' | 'over' = 'start';
  let paused = false;
  let level = 1;
  let score = 0;
  let record = false;
  let lives = LIVES;
  let combo = 0;
  let target = TARGETS[0];
  let bucket: Drops = emptyDrops();
  let bx = 0.5; // bucket center, share of the playfield
  let aim: number | null = null; // where the finger is
  const keys = new Set<'left' | 'right'>();
  let drops: Drop[] = [];
  let clouds: Cloud[] = [];
  let splats: Splat[] = [];
  let parts: Particle[] = [];
  let floats: Float[] = [];
  let spawnT = 0;
  let phaseT = 0;
  let time = 0;
  let shakeT = 0;
  let belt = 0; // cloud belt offset, wraps at 1
  let mouseT = 0;
  let mouse: { x: number; dir: 1 | -1 } | null = null;

  const goal = (p: Pigment) => target.recipe[p] * MULT;
  const capacity = () => totalDrops(target.recipe) * MULT;
  const kindHex = (k: Kind) => (k === 'mud' ? MUD_HEX : k.hex);
  /** The drop still fits the recipe: no paint goes over its share. */
  const fits = (k: Paint) => PIGMENTS.every((p) => bucket[p] + k.recipe[p] <= goal(p));
  const targetFor = (lv: number) => TARGETS[lv - 1] ?? any(TARGETS);

  // ---------- layout ----------
  let W = 0, H = 0, PW = 0, OX = 0, dpr = 1;
  function resize(w: number, h: number) {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = w;
    H = h;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    PW = Math.min(W, H * 0.95);
    OX = (W - PW) / 2;
  }
  const L = () => {
    const cloudY = 104;
    const groundY = H - Math.max(36, H * 0.07);
    const bw = Math.max(70, BUCKET * PW);
    // Клякса stands on the floor and holds the bucket over its head
    const bodyH = bw * 0.72;
    const bh = bw * 0.55;
    const bTop = groundY - bodyH - bw * 0.12 - bh;
    const dropR = Math.max(9, Math.min(20, PW * 0.026));
    return { cloudY, groundY, bw, bh, bTop, bodyH, dropR };
  };

  // ---------- rules ----------
  function setupLevel() {
    target = targetFor(level);
    bucket = emptyDrops();
    drops = [];
    clouds = Array.from({ length: CLOUDS }, (_, i) => ({ slot: i / CLOUDS, x: 0, release: 0, next: null }));
    spawnT = -0.6;
  }

  function start() {
    level = 1;
    score = 0;
    record = false;
    lives = LIVES;
    combo = 0;
    splats = [];
    parts = [];
    floats = [];
    mouseT = 0;
    mouse = null;
    bx = 0.5;
    setupLevel();
    phase = 'play';
    phaseT = 0;
    paused = false;
    opts.on({ type: 'level', target, first: true });
  }

  function pickKind(): Kind {
    if (Math.random() < MUD) return 'mud';
    const fitting = DROPS.filter(fits);
    if (fitting.length && Math.random() < HELP) return any(fitting);
    return any(DROPS);
  }

  function burst(x: number, y: number, hex: string, n: number, power: number) {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 1.05, Math.PI * 1.95);
      const s = rand(120, 320) * power;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, hex, t: 0, r: rand(3, 7) });
    }
  }

  const label = (text: string, hex: string, x: number, y: number, big = false) =>
    floats.push({ text, hex, x, y, t: 0, big });

  function spoil(why: 'mud' | 'extra', text: string) {
    const { bTop } = L();
    const hex = mixHex(bucket);
    if (hex) burst(OX + bx * PW, bTop, hex, 16, 1.1);
    bucket = emptyDrops();
    lives--;
    combo = 0;
    if (!opts.calm) shakeT = 0.3;
    label(text, '#D7263D', bx, bTop - 30, true);
    const over = lives <= 0;
    opts.on({ type: 'spoil', why, over });
    if (over) {
      record = score > opts.best();
      phase = 'over';
      phaseT = 0;
      drops = [];
      opts.on({ type: 'over', score });
    }
  }

  function pour() {
    if (phase !== 'play' || paused || !totalDrops(bucket)) return;
    const { bTop } = L();
    burst(OX + bx * PW, bTop, mixHex(bucket)!, 10, 0.7);
    bucket = emptyDrops();
    combo = 0;
    label('Вылили', INK, bx, bTop - 30);
    opts.on({ type: 'pour' });
  }

  function onCatch(d: Drop) {
    if (d.kind === 'mud') return spoil('mud', 'Грязь!');
    const k = d.kind;
    if (!fits(k)) {
      for (const p of PIGMENTS) bucket[p] += k.recipe[p];
      return spoil('extra', `Лишняя ${k.name.toLowerCase()}!`);
    }
    for (const p of PIGMENTS) bucket[p] += k.recipe[p];
    const { bTop } = L();
    burst(OX + d.x * PW, bTop, k.hex, 5, 0.5);
    combo++;
    const pts = 10 * Math.min(combo, 5);
    score += pts;
    label(combo > 1 ? `+${pts} ×${Math.min(combo, 5)}` : `+${pts}`, INK, d.x, bTop - 20);
    opts.on({ type: 'catch', combo });
    // only fitting drops get in, so a full bucket is exactly the recipe
    if (totalDrops(bucket) >= capacity()) win();
  }

  function win() {
    const bonus = 100 * level;
    score += bonus;
    const { bTop } = L();
    burst(OX + bx * PW, bTop, target.hex, 30, 1.6);
    label(`${target.name}! +${bonus}`, target.hex, 0.5, H * 0.42, true);
    phase = 'won';
    phaseT = 0;
    drops = [];
    opts.on({ type: 'win', target, next: targetFor(level + 1) });
  }

  // ---------- simulation ----------
  function update(dt: number) {
    time += dt;
    phaseT += dt;
    const { cloudY, groundY, bw, bTop } = L();

    for (const q of parts) {
      q.t += dt;
      q.vy += 900 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.y > groundY) {
        if (Math.random() < 0.3)
          splats.push({ x: (q.x - OX) / PW, y: groundY + rand(2, 14), r: q.r * 1.3, hex: q.hex, seed: Math.random() });
        q.t = 99;
      }
    }
    parts = parts.filter((q) => q.t < 2);
    floats.forEach((f) => (f.t += dt));
    floats = floats.filter((f) => f.t < 1.2);
    shakeT = Math.max(0, shakeT - dt);
    if (splats.length > 160) splats.splice(0, splats.length - 160);

    if (phase === 'won' && phaseT > WON_PAUSE) {
      level++;
      setupLevel();
      phase = 'play';
      opts.on({ type: 'level', target, first: false });
    }
    if (phase === 'play' || phase === 'won') {
      // every now and then a little mouse runs along the floor and mops up the splats
      mouseT += dt;
      if (!mouse && mouseT >= MOUSE_EVERY) {
        mouseT = 0;
        const dir = Math.random() < 0.5 ? 1 : -1;
        mouse = { x: dir === 1 ? -0.12 : 1.12, dir };
        opts.on({ type: 'mouse' });
      }
      if (mouse) {
        const m = mouse;
        m.x += m.dir * 0.33 * dt;
        const mop = m.x + m.dir * 0.07;
        splats = splats.filter((s) => (m.dir === 1 ? s.x > mop : s.x < mop));
        if (m.x < -0.15 || m.x > 1.15) mouse = null;
      }
    }
    if (phase !== 'play') return;

    // the bucket follows the finger or the keys at a limited speed
    let want = bx;
    if (keys.size === 1) want = bx + (keys.has('right') ? 1 : -1);
    else if (aim !== null) want = aim;
    const half = bw / 2 / PW;
    want = Math.max(half, Math.min(1 - half, want));
    const step = BUCKET_SPEED * dt;
    bx += Math.max(-step, Math.min(step, want - bx));

    // the cloud belt mostly drifts one way and now and then turns back
    belt = (belt + dt * (0.05 * Math.sin(time * 0.23) + 0.025) + 1) % 1;
    for (const c of clouds) {
      c.x = (c.slot + belt) % 1;
      if (!c.release) continue;
      c.release -= dt;
      if (c.release > 0) continue;
      c.release = 0;
      const x = Math.max(0.06, Math.min(0.94, c.x));
      drops.push({ kind: c.next!, x, y: cloudY + 22, r: L().dropR, wob: rand(0, 6) });
    }
    spawnT += dt;
    if (spawnT >= SPAWN * Math.max(0.35, 1 - SPAWN_GROWTH * (level - 1))) {
      spawnT = 0;
      const free = clouds.filter((c) => !c.release);
      if (free.length) {
        const c = any(free);
        c.next = pickKind();
        c.release = TREMBLE;
      }
    }

    const v = FALL * (1 + FALL_GROWTH * (level - 1)) * (groundY - cloudY);
    for (const d of drops) {
      const before = d.y;
      d.y += v * dt;
      if (before < bTop && d.y >= bTop && Math.abs(d.x - bx) * PW < bw / 2 + d.r * 0.3) {
        d.y = Infinity;
        onCatch(d);
        if (phase !== 'play') return;
      } else if (d.y >= groundY) {
        d.y = Infinity;
        splats.push({ x: d.x, y: groundY + rand(4, 16), r: d.r * 1.6, hex: kindHex(d.kind), seed: Math.random() });
        if (d.kind !== 'mud' && fits(d.kind)) combo = 0;
      }
    }
    drops = drops.filter((d) => d.y !== Infinity);
  }

  // ---------- drawing ----------
  function teardrop(x: number, y: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 2.1);
    ctx.quadraticCurveTo(x + r * 1.1, y - r * 0.6, x + r, y);
    ctx.arc(x, y, r, 0, Math.PI);
    ctx.quadraticCurveTo(x - r * 1.1, y - r * 0.6, x, y - r * 2.1);
    ctx.closePath();
  }

  function wobbly(x: number, y: number, rx: number, ry: number, k: (a: number) => number, steps = 40) {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * rx * k(a), py = y + Math.sin(a) * ry * k(a);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  function drawDrop(d: Drop) {
    const x = OX + d.x * PW + Math.sin(time * 6 + d.wob) * 1.5;
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    if (d.kind === 'mud') {
      const r = d.r * 1.15;
      wobbly(x, d.y, r, r, (a) => 1 + 0.16 * Math.sin(a * 5 + d.wob + time * 4), 24);
      ctx.fillStyle = MUD_HEX;
      ctx.fill();
      ctx.stroke();
      // grumpy cross eyes
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (const s of [-1, 1]) {
        const ex = x + s * d.r * 0.55;
        ctx.moveTo(ex - 3, d.y - 4);
        ctx.lineTo(ex + 3, d.y + 2);
        ctx.moveTo(ex + 3, d.y - 4);
        ctx.lineTo(ex - 3, d.y + 2);
      }
      ctx.stroke();
      return;
    }
    teardrop(x, d.y, d.r);
    ctx.fillStyle = d.kind.hex;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath();
    ctx.ellipse(x - d.r * 0.35, d.y - d.r * 0.2, d.r * 0.22, d.r * 0.35, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCloud(c: Cloud, y: number, shift: number) {
    const x = OX + (c.x + shift) * PW + (c.release ? Math.sin(time * 70) * 2.5 : 0);
    if (x < OX - PW * 0.15 || x > OX + PW * 1.15) return;
    const s = Math.max(16, PW * 0.04);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    // the coming drop swells under the cloud while it trembles
    if (c.release && c.next) {
      const r = L().dropR * (0.35 + 0.65 * (1 - c.release / TREMBLE));
      ctx.fillStyle = kindHex(c.next);
      teardrop(x, y + s * 0.55 + r * 1.2, r);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x - s * 0.9, y + s * 0.15, s * 0.7, 0, Math.PI * 2);
    ctx.arc(x, y - s * 0.25, s, 0, Math.PI * 2);
    ctx.arc(x + s * 0.9, y + s * 0.15, s * 0.7, 0, Math.PI * 2);
    // stroke, then fill over it, so the arcs inside vanish
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = '#E9E4F0';
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.45, s * 1.35, s * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    for (const e of [-0.32, 0.32]) {
      ctx.beginPath();
      ctx.arc(x + e * s, y - s * 0.15 + 1, s * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMouse() {
    if (!mouse) return;
    const { groundY } = L();
    const s = Math.max(14, PW * 0.035);
    ctx.save();
    ctx.translate(OX + mouse.x * PW, groundY + 6 - Math.abs(Math.sin(time * 18)) * 3);
    ctx.scale(mouse.dir, 1); // drawn facing right
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); // tail
    ctx.moveTo(-s * 1.1, -s * 0.4);
    ctx.quadraticCurveTo(-s * 2, -s * 1.4 + Math.sin(time * 12) * 4, -s * 2.4, -s * 0.6);
    ctx.stroke();
    // the mop: a stick held forward and a wet head sweeping the floor
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#A0703C';
    ctx.beginPath();
    ctx.moveTo(s * 0.4, -s * 1.3);
    ctx.lineTo(s * 2.1, -s * 0.05);
    ctx.stroke();
    ctx.fillStyle = '#7FB3E6';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(s * 1.75 + i * s * 0.18, s * 0.05 + Math.sin(time * 20 + i) * 1.5, s * 0.14, s * 0.32, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#A9A3B5';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); // body
    ctx.ellipse(0, -s * 0.55, s * 1.15, s * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath(); // head
    ctx.ellipse(s * 0.95, -s * 0.85, s * 0.55, s * 0.45, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#F2B8C6';
    ctx.beginPath(); // ear
    ctx.arc(s * 0.75, -s * 1.35, s * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath(); // nose
    ctx.arc(s * 1.47, -s * 0.78, s * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath(); // eye
    ctx.arc(s * 1.08, -s * 0.95, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); // running feet
    for (const f of [-0.5, 0.5]) {
      ctx.moveTo(f * s, -s * 0.05);
      ctx.lineTo(f * s + Math.sin(time * 18 + f * 3) * 4, s * 0.15);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    const { bw, bh, bTop, bodyH, groundY } = L();
    const x = OX + bx * PW;
    const squish = 1 + 0.03 * Math.sin(time * 4);
    const rx = bw * 0.4 * squish, ry = bodyH / 2 / squish;
    const cy = groundY - ry;
    const top = bTop, bot = bTop + bh;
    const tw = bw / 2, bwb = bw * 0.38;

    // arms first, so the body and the bucket cover their ends
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (const sd of [-1, 1]) {
      ctx.moveTo(x + sd * rx * 0.8, cy - ry * 0.3);
      ctx.quadraticCurveTo(x + sd * (tw + 8), cy - ry * 0.9, x + sd * (bwb + 6), bot - 4);
    }
    ctx.stroke();
    ctx.fillStyle = BLOB;
    ctx.lineWidth = 2.5;
    for (const sd of [-1, 1]) {
      ctx.beginPath(); // hands on the bucket
      ctx.arc(x + sd * (bwb + 4), bot - 6, bw * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // the body has a flat bottom on the floor
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const k = 1 + 0.05 * Math.sin(a * 5 + time * 3);
      const px = x + Math.cos(a) * rx * k;
      const py = cy + Math.sin(a) * ry * (Math.sin(a) > 0 ? 1 : k);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // eyes look up at the lowest drop
    const next = drops.filter((d) => d.y < bTop).sort((a, b) => b.y - a.y)[0];
    const look = next ? Math.max(-1, Math.min(1, (OX + next.x * PW - x) / 120)) : 0;
    const er = Math.min(rx, ry);
    for (const e of [-0.32, 0.32]) {
      const ex = x + e * rx, ey = cy - ry * 0.22;
      ctx.fillStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ex, ey, er * 0.24, er * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(ex + look * er * 0.09, ey - er * 0.1, er * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 2.5;
    ctx.beginPath(); // smile
    ctx.arc(x, cy + ry * 0.2, er * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // the bucket over the head, filled with the mix so far
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(x - tw, top);
      ctx.lineTo(x + tw, top);
      ctx.lineTo(x + bwb, bot);
      ctx.lineTo(x - bwb, bot);
      ctx.closePath();
    };
    shape();
    ctx.fillStyle = '#D9DEE8';
    ctx.fill();
    const hex = mixHex(bucket);
    const fill = Math.min(1, totalDrops(bucket) / capacity());
    if (hex) {
      ctx.save();
      shape();
      ctx.clip();
      const surface = bot - (bot - top - 6) * fill;
      ctx.fillStyle = hex;
      ctx.beginPath();
      ctx.moveTo(x - tw, bot);
      for (let i = 0; i <= 20; i++) ctx.lineTo(x - tw + (i / 20) * bw, surface + Math.sin(i * 0.9 + time * 5) * 2.5);
      ctx.lineTo(x + tw, bot);
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(43,35,64,.25)';
    ctx.lineWidth = 1.5;
    const cap = capacity();
    ctx.beginPath(); // a tick per drop the bucket holds
    for (let i = 1; i < cap; i++) {
      const y = bot - ((bot - top - 6) * i) / cap;
      const hw = tw + (bwb - tw) * ((y - top) / (bot - top));
      ctx.moveTo(x + hw - 8, y);
      ctx.lineTo(x + hw - 2, y);
    }
    ctx.stroke();
    shape();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineCap = 'butt';
    if (hex) {
      ctx.font = `800 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.fillText(colorLabel(bucket), x, groundY + 16);
    }
  }

  function drawHud() {
    const x0 = OX + 12;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.fillStyle = target.hex;
    ctx.beginPath();
    ctx.arc(x0 + 24, 38, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `800 17px ${FONT}`;
    ctx.fillText(`${level}. ${target.name}`, x0 + 56, 26);
    // the recipe: a ring per drop of each paint, filled as it is caught
    let px = x0 + 62;
    ctx.lineWidth = 2;
    for (const p of PIGMENTS) {
      const hex = PAINT_BY_ID[p].hex;
      for (let i = 0; i < goal(p); i++) {
        ctx.beginPath();
        ctx.arc(px, 52, 7, 0, Math.PI * 2);
        ctx.fillStyle = i < bucket[p] ? hex : '#fff';
        ctx.fill();
        ctx.strokeStyle = i < bucket[p] || p === 'white' ? INK : hex;
        ctx.stroke();
        px += 18;
      }
      if (goal(p)) px += 6;
    }
    const xr = OX + PW - 12;
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText(String(score), xr, 26);
    ctx.font = `700 19px system-ui, sans-serif`;
    ctx.fillStyle = '#E8273F';
    ctx.fillText('♥'.repeat(Math.max(0, lives)) + '♡'.repeat(LIVES - Math.max(0, lives)), xr, 53);
    if (combo > 1) {
      ctx.fillStyle = INK;
      ctx.font = `800 14px ${FONT}`;
      ctx.fillText(`серия ×${Math.min(combo, 5)}`, xr - ctx.measureText(String(score)).width - 60, 26);
    }
  }

  function centerText(lines: [string, number, string?][], y: number) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [t, size, color] of lines) {
      ctx.font = `800 ${size}px ${FONT}`;
      ctx.fillStyle = color ?? INK;
      ctx.fillText(t, W / 2, y, W - 24);
      y += size * 1.35;
    }
  }

  function veil(alpha: number) {
    ctx.fillStyle = `rgba(255,251,243,${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  function draw() {
    const { cloudY, groundY } = L();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(shakeT ? Math.sin(time * 80) * 6 * (shakeT / 0.3) : 0, 0);
    if (OX > 1) {
      // on wide screens the playfield is a column; the sides stay out of play
      ctx.fillStyle = '#F6EAD6';
      ctx.fillRect(-10, 0, OX + 10, H);
      ctx.fillRect(OX + PW, 0, W - OX - PW + 10, H);
      ctx.strokeStyle = 'rgba(43,35,64,.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(OX, 0);
      ctx.lineTo(OX, H);
      ctx.moveTo(OX + PW, 0);
      ctx.lineTo(OX + PW, H);
      ctx.stroke();
    }
    ctx.fillStyle = '#F2DDB8';
    ctx.fillRect(-10, groundY, W + 20, H - groundY);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, groundY);
    ctx.lineTo(W + 10, groundY);
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    for (const s of splats) {
      wobbly(OX + s.x * PW, s.y, s.r, s.r * 0.45, (a) => 1 + 0.18 * Math.sin(a * 7 + s.seed * 10) + 0.08 * Math.sin(a * 3 + s.seed * 4));
      ctx.fillStyle = s.hex;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (phase === 'start') {
      drawPlayer();
      centerText(
        [
          ['Лови капли в ведро', 24],
          ['и смешай нужный цвет!', 24],
          ['', 8],
          ['Лишняя капля и грязь', 17],
          ['портят ведро', 17],
          ['', 8],
          ['Нажми, чтобы начать', 22, BLOB],
        ],
        H * 0.24,
      );
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(OX, 0, PW, H);
    ctx.clip();
    for (const c of clouds) for (const shift of [-1, 0, 1]) drawCloud(c, cloudY, shift);
    ctx.restore();
    for (const d of drops) drawDrop(d);
    drawPlayer();
    drawMouse();
    for (const q of parts) {
      ctx.fillStyle = q.hex;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fff';
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
      ctx.font = `800 ${f.big ? 26 : 16}px ${FONT}`;
      const fx = Math.max(60, Math.min(W - 60, OX + f.x * PW));
      ctx.strokeText(f.text, fx, f.y - f.t * 40);
      ctx.fillStyle = f.hex === '#FFFDF7' ? INK : f.hex;
      ctx.fillText(f.text, fx, f.y - f.t * 40);
    }
    ctx.globalAlpha = 1;
    drawHud();

    if (phase === 'over') {
      veil(0.88);
      centerText(
        [
          ['Ведро упало!', 36],
          [`Очки: ${score}`, 24],
          [record ? 'Новый рекорд!' : `Рекорд: ${opts.best()}`, 20, record ? '#E8273F' : INK],
          [`Дошли до цвета: ${target.name.toLowerCase()}`, 16],
          ['', 8],
          [phaseT > 0.8 ? 'Нажми, чтобы ещё раз' : '', 22, BLOB],
        ],
        H * 0.3,
      );
    } else if (paused) {
      veil(0.7);
      centerText([['Пауза', 36], ['Нажми, чтобы продолжить', 18, BLOB]], H * 0.42);
    }
  }

  // ---------- loop and input ----------
  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const toPlayfield = (clientX: number) => (clientX - canvas.getBoundingClientRect().left - OX) / PW;

  /** Starts, restarts or unpauses; true when the tap was used up by that. */
  function wake() {
    if (phase === 'start' || (phase === 'over' && phaseT > 0.8)) {
      start();
      return true;
    }
    if (paused && phase === 'play') {
      paused = false;
      return true;
    }
    return phase === 'over';
  }

  return {
    resize,
    pour,
    wake,
    get phase() {
      return phase;
    },
    get paused() {
      return paused;
    },
    set paused(on: boolean) {
      paused = on && phase === 'play';
    },
    pointer(clientX: number | null) {
      aim = clientX === null ? null : toPlayfield(clientX);
    },
    key(dir: 'left' | 'right', down: boolean) {
      if (down) keys.add(dir);
      else keys.delete(dir);
    },
    destroy() {
      cancelAnimationFrame(raf);
    },
  };
}
