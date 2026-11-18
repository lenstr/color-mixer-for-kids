// «Поймай цвет»: paint drops fall from white clouds, Клякса catches them in a
// bucket balanced on its head, and the bucket mixes them like the mixer does.
// The bucket must reach the target's recipe × MULT exactly: a drop that does
// not fit (or mud) spoils the bucket and costs a life.
//
// The game draws the sky, the drops, the bucket and the shelf on a
// transparent 2D canvas in the same ink-outlined style as the rest of the
// game. Клякса itself is the real WebGL blob, which the screen places under
// the bucket from `frame`; the screen also shows the HUD and dialogs and
// turns `on` events into sounds and voice.

import { BODY_R, GROUND } from '../blob/shape';
import { type Drops, type Pigment, PIGMENTS, emptyDrops, mixHex, mixHexes, shade } from '../color';
import { COLOR_BY_ID, type NamedColor, PAINT_BY_ID } from '../data';
import { DROP_GLOSS, DROP_PATH } from '../jar';
import { CARD, INK } from '../palette';

/** A paint's drop, named like its jar. */
const paint = <P extends Pigment>(id: P) => [id, PAINT_BY_ID[id].name] as const;

// The drops that fall, all of them on every level. A mixed drop pours its
// whole recipe into the bucket, so purple and white make lilac.
const DROPS = [
  paint('red'),
  paint('yellow'),
  paint('blue'),
  paint('white'),
  ['green', 'Зелёная'] as const,
  ['pink', 'Розовая'] as const,
  ['skyblue', 'Голубая'] as const,
  paint('black'),
  ['purple', 'Фиолетовая'] as const,
].map(([id, name]) => ({ id, name, recipe: COLOR_BY_ID[id].recipe, hex: COLOR_BY_ID[id].hex }));
type Paint = (typeof DROPS)[number];
type DropId = Paint['id'];
type Kind = Paint | 'mud';
const DROP_BY_ID = Object.fromEntries(DROPS.map((d) => [d.id, d])) as Record<DropId, Paint>;

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
/** styles.css --display, for the floating labels. */
const DISPLAY = 'Unbounded, "Arial Black", system-ui, sans-serif';
const DROP = new Path2D(DROP_PATH);
/** Клякса's height above the floor for its width. */
const BODY_HEIGHT = (BODY_R + GROUND) / (2 * BODY_R);

/** A color to catch and the drops it is made of, each caught MULT times. */
export interface CatchLevel {
  target: NamedColor;
  drops: Paint[];
}
const lv = (id: string, ...drops: DropId[]): CatchLevel => ({
  target: COLOR_BY_ID[id],
  drops: drops.map((d) => DROP_BY_ID[d]),
});

/** Simple mixes first, then colors made from the mixed drops too. Each
 * recipe adds up to the target's own recipe, so the bucket ends exactly in
 * the target color. */
export const LEVELS: CatchLevel[] = [
  lv('orange', 'red', 'yellow'),
  lv('green', 'yellow', 'blue'),
  lv('purple', 'red', 'blue'),
  lv('pink', 'red', 'white'),
  lv('skyblue', 'blue', 'white'),
  lv('lilac', 'purple', 'white'),
  lv('lime', 'green', 'yellow'),
  lv('peach', 'pink', 'yellow'),
  lv('turquoise', 'green', 'blue'),
  lv('raspberry', 'purple', 'red'),
  lv('gray', 'white', 'black'),
  lv('brown', 'red', 'yellow', 'blue'),
  lv('mint', 'skyblue', 'yellow', 'white'),
  lv('darkgreen', 'green', 'black'),
  lv('navy', 'blue', 'blue', 'black'),
  lv('burgundy', 'red', 'red', 'black'),
  lv('honey', 'red', 'yellow', 'yellow'),
  lv('carrot', 'red', 'red', 'yellow'),
];

/** One kind of drop in the recipe: how many the bucket needs and has. */
export interface RecipePart {
  hex: string;
  name: string;
  need: number;
  got: number;
}

export interface Hud {
  level: number;
  target: NamedColor;
  recipe: RecipePart[];
  score: number;
  lives: number;
}

export type CatchEvent =
  | { type: 'level'; target: NamedColor; first: boolean }
  /** a caught drop splashed into the paint */
  | { type: 'catch'; pigment: Pigment; combo: number }
  | { type: 'spoil'; why: 'mud' | 'extra'; over: boolean }
  | { type: 'pour' }
  | { type: 'win'; target: NamedColor; next: NamedColor }
  | { type: 'over'; score: number; level: number }
  | { type: 'mouse' }
  /** the bucket hit the shelf after the last life */
  | { type: 'thud' }
  /** Клякса lands after a joyful hop */
  | { type: 'land' }
  | { type: 'hud'; hud: Hud };

/** Where Клякса stands, in canvas CSS pixels. */
export interface Player {
  x: number;
  groundY: number;
  /** body width; the bucket on its head is as wide */
  width: number;
  /** the drop it watches, if any */
  look: { x: number; y: number } | null;
  /** right end of the shelf */
  shelfRight: number;
  /** how high Клякса hops right now, in pixels (negative is up) */
  hop: number;
}

export interface CatchOptions {
  on(e: CatchEvent): void;
  frame(p: Player): void;
  /** no shaking */
  calm: boolean;
}

interface Drop { kind: Kind; x: number; y: number; r: number; wob: number }
interface Cloud { slot: number; x: number; release: number; next: Kind | null }
interface Splat { x: number; r: number; hex: string; seed: number }
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
  let lives = LIVES;
  let combo = 0;
  let stage = LEVELS[0];
  let upcoming: CatchLevel | null = null;
  let bucket: Drops = emptyDrops(); // the paint, for its color when it spills
  let caught: Partial<Record<DropId, number>> = {};
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
  let mouse: { x: number; dir: 1 | -1 } | null = null; // x: share of the shelf
  let slosh = 0; // the paint sways after a catch
  // What the bucket shows. A caught drop counts for the rules at the rim but
  // reaches the paint a moment later: it sinks through the glass, splashes,
  // and its color swirls into the mix. Positions are relative to the
  // bucket's bottom center, so everything moves with the bucket.
  let shown: Drops = emptyDrops();
  let shownN = 0; // drops that reached the paint
  let shownFill = 0;
  let tint = { from: '', to: '', t: 1 };
  let sinking: { dx: number; y: number; vy: number; r: number; kind: Paint; combo: number }[] = [];
  let ripples: { dx: number; t: number }[] = [];
  let swirls: { dx: number; t: number; hex: string; spin: number }[] = [];
  let splashes: { dx: number; y: number; vx: number; vy: number; r: number; hex: string }[] = [];
  let bumpT = 9; // seconds since a drop hit the paint; the bucket squashes and springs back
  function emptyBucket() {
    bucket = emptyDrops();
    caught = {};
    shown = emptyDrops();
    shownN = 0;
    shownFill = 0;
    tint = { from: '', to: '', t: 1 };
    sinking = [];
    ripples = [];
    swirls = [];
  }

  // a full bucket makes Клякса hop for joy, bucket and all
  let hop = 0, hopV = 0, hops = 0, hopWait = 0;
  /** The bucket falling off Клякса's head after the last life: its bottom
   * center moves by (dx, dy) and it turns by `rot` around that point. */
  let fall: { dx: number; dy: number; vx: number; vy: number; rot: number; vr: number; dir: 1 | -1; landed: number; spill: string | null } | null = null;

  const need = (id: DropId) => stage.drops.filter((d) => d.id === id).length * MULT;
  const caughtN = () => Object.values(caught).reduce((a, b) => a + b, 0);
  const capacity = () => stage.drops.length * MULT;
  const kindHex = (k: Kind) => (k === 'mud' ? MUD_HEX : k.hex);
  /** The bucket still needs this drop. */
  const fits = (k: Paint) => (caught[k.id] ?? 0) < need(k.id);
  const levelFor = (n: number) => LEVELS[n - 1] ?? any(LEVELS);
  const recipe = (): RecipePart[] =>
    [...new Set(stage.drops)].map((d) => ({ hex: d.hex, name: d.name, need: need(d.id), got: caught[d.id] ?? 0 }));
  const snapshot = (): Hud => ({ level, target: stage.target, recipe: recipe(), score, lives });
  const hud = () => opts.on({ type: 'hud', hud: snapshot() });

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
    L = layout();
  }
  const PLANK = 30;
  /** Where things stand, in canvas CSS pixels; it changes only on resize. */
  function layout() {
    const cloudY = Math.max(40, Math.min(56, PW * 0.1));
    const groundY = H - PLANK - 10;
    const bw = Math.max(64, BUCKET * PW);
    // the bucket stands on Клякса's head
    const bh = bw * 0.62;
    const bBot = groundY - bw * BODY_HEIGHT + 3;
    const bTop = bBot - bh;
    const dropR = Math.max(10, Math.min(19, PW * 0.03));
    // the shelf spans the playfield, so on wide screens it shows where to play
    const shelfX0 = Math.max(4, OX - 24);
    const shelfX1 = Math.min(W - 4, OX + PW + 24);
    return { cloudY, groundY, bw, bh, bTop, bBot, dropR, shelfX0, shelfX1 };
  }
  let L = layout();

  // ---------- rules ----------
  function setupLevel() {
    stage = upcoming ?? levelFor(level);
    upcoming = null;
    emptyBucket();
    drops = [];
    clouds = Array.from({ length: CLOUDS }, (_, i) => ({ slot: i / CLOUDS, x: i / CLOUDS, release: 0, next: null }));
    spawnT = -0.6;
  }
  setupLevel();

  function start() {
    level = 1;
    score = 0;
    lives = LIVES;
    combo = 0;
    splats = [];
    parts = [];
    floats = [];
    mouseT = 0;
    mouse = null;
    fall = null;
    hop = hopV = hops = hopWait = 0;
    bx = 0.5;
    setupLevel();
    phase = 'play';
    phaseT = 0;
    paused = false;
    opts.on({ type: 'level', target: stage.target, first: true });
    hud();
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

  /** Empty the bucket with a splash of its paint; returns the paint's color. */
  function spill(n: number, power: number) {
    const hex = mixHex(bucket);
    if (hex) burst(OX + bx * PW, L.bTop, hex, n, power);
    emptyBucket();
    combo = 0;
    return hex;
  }

  function spoil(why: 'mud' | 'extra', text: string) {
    const hex = spill(16, 1.1);
    lives--;
    if (!opts.calm) shakeT = 0.3;
    label(text, '#E8273F', bx, L.bTop - 34, true);
    const over = lives <= 0;
    opts.on({ type: 'spoil', why, over });
    hud();
    if (over) {
      // the bucket slides off towards the open side and tumbles down
      const dir = bx < 0.5 ? 1 : -1;
      const spill = hex ?? (why === 'mud' ? MUD_HEX : null);
      fall = { dx: 0, dy: 0, vx: dir * 160, vy: -330, rot: 0, vr: dir * 5.2, dir, landed: 0, spill };
      phase = 'over';
      phaseT = 0;
      drops = [];
      opts.on({ type: 'over', score, level });
    }
  }

  function pour() {
    if (phase !== 'play' || paused || !caughtN()) return;
    spill(10, 0.7);
    label('Вылили', CARD, bx, L.bTop - 34);
    opts.on({ type: 'pour' });
    hud();
  }

  function onCatch(d: Drop) {
    if (d.kind === 'mud') return spoil('mud', 'Грязь!');
    const k = d.kind;
    const fit = fits(k);
    // the drop goes in either way, so a spoiled bucket splashes its color
    for (const p of PIGMENTS) bucket[p] += k.recipe[p];
    if (!fit) return spoil('extra', `Лишняя ${k.name.toLowerCase()}!`);
    caught[k.id] = (caught[k.id] ?? 0) + 1;
    const { bTop, bh, bw } = L;
    combo++;
    // the drop keeps falling, now inside the bucket
    const dx = Math.max(-bw * 0.3, Math.min(bw * 0.3, (d.x - bx) * PW));
    sinking.push({ dx, y: -bh + bw * 0.05, vy: FALL * (L.groundY - L.cloudY) * 1.2, r: d.r, kind: k, combo });
    const pts = 10 * Math.min(combo, 5);
    score += pts;
    label(combo > 1 ? `+${pts} ×${Math.min(combo, 5)}` : `+${pts}`, '#FFD21F', d.x, bTop - 22);
    // only fitting drops get in, so a full bucket is exactly the recipe
    if (caughtN() >= capacity()) win();
    hud();
  }

  function win() {
    const bonus = 100 * level;
    score += bonus;
    const { bTop } = L;
    burst(OX + bx * PW, bTop, stage.target.hex, 30, 1.6);
    label(`+${bonus}`, '#FFD21F', bx, bTop - 60, true);
    phase = 'won';
    phaseT = 0;
    drops = [];
    hops = 2;
    hopWait = 0.32; // the last drop lands first
    upcoming = levelFor(level + 1);
    opts.on({ type: 'win', target: stage.target, next: upcoming.target });
  }

  // ---------- paint in the bucket ----------
  function updatePaint(dt: number) {
    const { bw, bh } = L;
    const inner = bh - bw * 0.13;
    const surface = -inner * shownFill; // relative to the bucket's bottom
    for (const d of sinking) {
      d.vy += 1800 * dt;
      d.y += d.vy * dt;
      if (d.y + d.r * 0.4 < surface) continue;
      // splash: the color goes in, rings and droplets come out
      d.y = Infinity;
      const before = mixHex(shown);
      for (const p of PIGMENTS) shown[p] += d.kind.recipe[p];
      shownN++;
      const after = mixHex(shown)!;
      tint = { from: before ?? after, to: after, t: before ? 0 : 1 };
      ripples.push({ dx: d.dx, t: 0 });
      swirls.push({ dx: d.dx, t: 0, hex: d.kind.hex, spin: Math.random() < 0.5 ? 1 : -1 });
      for (let i = 0; i < 6; i++)
        splashes.push({ dx: d.dx, y: surface, vx: rand(-90, 90), vy: rand(-330, -190), r: rand(2.5, 4.5), hex: i % 2 ? d.kind.hex : after });
      bumpT = 0;
      slosh = 1;
      const pigment = PIGMENTS.find((p) => d.kind.recipe[p] > 0)!;
      opts.on({ type: 'catch', pigment, combo: d.combo });
    }
    sinking = sinking.filter((d) => d.y !== Infinity);
    shownFill += (shownN / capacity() - shownFill) * Math.min(1, dt * 12);
    if (tint.t < 1) tint.t = Math.min(1, tint.t + dt / 0.7);
    ripples.forEach((r) => (r.t += dt));
    ripples = ripples.filter((r) => r.t < 0.6);
    swirls.forEach((w) => (w.t += dt));
    swirls = swirls.filter((w) => w.t < 0.9);
    for (const q of splashes) {
      q.vy += 1400 * dt;
      q.dx += q.vx * dt;
      q.y += q.vy * dt;
    }
    splashes = splashes.filter((q) => q.vy < 0 || q.y < surface);
    bumpT += dt;
  }

  // ---------- hop for joy ----------
  const HOP_G = 2600;
  function updateHop(dt: number) {
    if (hopWait > 0) {
      hopWait -= dt;
      if (hopWait <= 0 && hops > 0) {
        hops--;
        hopV = -Math.sqrt(2 * HOP_G * L.bw * (hops ? 0.55 : 0.35)); // the second hop is smaller
      }
      return;
    }
    if (!hopV && !hop) return;
    hopV += HOP_G * dt;
    hop += hopV * dt;
    if (hop >= 0) {
      hop = 0;
      hopV = 0;
      slosh = 1;
      opts.on({ type: 'land' });
      if (hops > 0) hopWait = 0.06;
    }
  }

  // ---------- simulation ----------
  function update(dt: number) {
    time += dt;
    phaseT += dt;
    slosh = Math.max(0, slosh - dt * 1.5);
    updateHop(dt);
    updatePaint(dt);
    const { cloudY, groundY, bw, bTop } = L;

    for (const q of parts) {
      q.t += dt;
      q.vy += 900 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.y > groundY) {
        if (Math.random() < 0.3) splats.push({ x: (q.x - OX) / PW, r: q.r * 1.3, hex: q.hex, seed: Math.random() });
        q.t = 99;
      }
    }
    parts = parts.filter((q) => q.t < 2);
    floats.forEach((f) => (f.t += dt));
    floats = floats.filter((f) => f.t < 1.2);
    shakeT = Math.max(0, shakeT - dt);
    if (splats.length > 160) splats.splice(0, splats.length - 160);

    // the cloud belt mostly drifts one way and now and then turns back
    belt = (belt + dt * (0.05 * Math.sin(time * 0.23) + 0.025) + 1) % 1;
    for (const c of clouds) c.x = (c.slot + belt) % 1;

    if (phase === 'won' && phaseT > WON_PAUSE) {
      level++;
      setupLevel();
      phase = 'play';
      opts.on({ type: 'level', target: stage.target, first: false });
      hud();
    }
    if (phase === 'play' || phase === 'won') {
      // every now and then a little mouse runs along the shelf and mops up the splats
      mouseT += dt;
      if (!mouse && mouseT >= MOUSE_EVERY) {
        mouseT = 0;
        const dir = Math.random() < 0.5 ? 1 : -1;
        mouse = { x: dir === 1 ? -0.1 : 1.1, dir };
        opts.on({ type: 'mouse' });
      }
      if (mouse) {
        const m = mouse;
        m.x += m.dir * 0.3 * dt; // share of the shelf per second
        const { shelfX0: x0, shelfX1: x1 } = L;
        const mop = (x0 + m.x * (x1 - x0) + m.dir * Math.max(14, PW * 0.035) * 2 - OX) / PW;
        splats = splats.filter((s) => (m.dir === 1 ? s.x > mop : s.x < mop));
        if (m.x < -0.12 || m.x > 1.12) mouse = null;
      }
    }
    if (fall) updateFall(dt);
    if (phase !== 'play') return;

    // the bucket follows the finger or the keys at a limited speed
    let want = bx;
    if (keys.size === 1) want = bx + (keys.has('right') ? 1 : -1);
    else if (aim !== null) want = aim;
    const half = bw / 2 / PW;
    want = Math.max(half, Math.min(1 - half, want));
    const step = BUCKET_SPEED * dt;
    bx += Math.max(-step, Math.min(step, want - bx));

    for (const c of clouds) {
      if (!c.release) continue;
      c.release -= dt;
      if (c.release > 0) continue;
      c.release = 0;
      const x = Math.max(0.06, Math.min(0.94, c.x));
      drops.push({ kind: c.next!, x, y: cloudY + 30, r: L.dropR, wob: rand(0, 6) });
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
        splats.push({ x: d.x, r: d.r * 1.6, hex: kindHex(d.kind), seed: Math.random() });
        if (d.kind !== 'mud' && fits(d.kind)) combo = 0;
      }
    }
    drops = drops.filter((d) => d.y !== Infinity);
  }

  /** Corners of the bucket around its bottom center, for the fall. */
  function bucketCorners() {
    const { bw, bh } = L;
    return [[-bw / 2, -bh], [bw / 2, -bh], [-bw * 0.39, 0], [bw * 0.39, 0]];
  }

  function updateFall(dt: number) {
    const f = fall!;
    const { groundY, bBot } = L;
    f.vy += 1500 * dt;
    f.dx += f.vx * dt;
    f.dy += f.vy * dt;
    if (f.landed) {
      // settle on its side
      f.rot += (f.dir * Math.PI * 0.5 - f.rot) * Math.min(1, dt * 10);
      f.vx *= Math.exp(-dt * 6);
    } else f.rot += f.vr * dt;
    // the lowest corner rests on the shelf
    const low = Math.max(...bucketCorners().map(([ox, oy]) => ox * Math.sin(f.rot) + oy * Math.cos(f.rot)));
    const floor = groundY - 2 - bBot - low;
    if (f.dy > floor) {
      f.dy = floor;
      if (!f.landed) {
        f.landed = 1;
        f.vy = -f.vy * 0.28;
        f.vx *= 0.5;
        opts.on({ type: 'thud' });
        if (!opts.calm) shakeT = 0.25;
        // what was left in it spills over the shelf
        const mouthX = OX + bx * PW + f.dx + f.dir * L.bw * 0.6;
        if (f.spill) {
          burst(mouthX, groundY - 4, f.spill, 14, 0.8);
          for (let i = 0; i < 3; i++)
            splats.push({ x: (mouthX - OX) / PW + f.dir * i * 0.03, r: rand(12, 20), hex: f.spill, seed: Math.random() });
        }
      } else if (f.vy > 0) f.vy = 0;
    }
  }

  // ---------- drawing ----------
  function inkShadow(draw: () => void, dx: number, dy: number) {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.fillStyle = INK;
    draw();
    ctx.fill();
    ctx.restore();
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

  /** A paint drop like the ones on the jars, its round part centered at (x, y). */
  function paintDrop(x: number, y: number, r: number, hex: string) {
    const s = r / 15;
    ctx.save();
    ctx.translate(x, y - 7 * s);
    ctx.scale(s, s);
    ctx.fillStyle = hex;
    ctx.fill(DROP);
    ctx.lineWidth = 3.6;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.stroke(DROP);
    const g = DROP_GLOSS;
    ctx.fillStyle = `rgba(255,255,255,${g.opacity})`;
    ctx.beginPath();
    ctx.ellipse(g.cx, g.cy, g.rx, g.ry, (g.deg * Math.PI) / 180, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDrop(d: Drop) {
    const x = OX + d.x * PW + Math.sin(time * 6 + d.wob) * 1.5;
    if (d.kind !== 'mud') return paintDrop(x, d.y, d.r, d.kind.hex);
    const r = d.r * 1.15;
    const shape = () => wobbly(x, d.y, r, r, (a) => 1 + 0.16 * Math.sin(a * 5 + d.wob + time * 4), 24);
    shape();
    ctx.fillStyle = MUD_HEX;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // grumpy cross eyes
    ctx.strokeStyle = CARD;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const s of [-1, 1]) {
      const ex = x + s * d.r * 0.5;
      ctx.moveTo(ex - 3, d.y - 4);
      ctx.lineTo(ex + 3, d.y + 2);
      ctx.moveTo(ex + 3, d.y - 4);
      ctx.lineTo(ex - 3, d.y + 2);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function drawCloud(c: Cloud, y: number, shift: number) {
    const at = c.x + shift;
    if (at < -0.12 || at > 1.12) return;
    const x = OX + at * PW + (c.release ? Math.sin(time * 70) * 2.5 : 0);
    // clouds shrink away and grow back at the sides of the playfield
    const grow = Math.max(0, Math.min(1, (at + 0.12) / 0.16, (1.12 - at) / 0.16));
    if (grow < 0.05) return;
    const s = Math.max(15, Math.min(24, PW * 0.042)) * grow;
    // the coming drop swells under the cloud while it trembles
    if (c.release && c.next) {
      const r = L.dropR * (0.35 + 0.65 * (1 - c.release / TREMBLE));
      if (c.next === 'mud') {
        ctx.fillStyle = MUD_HEX;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y + s * 0.6 + r, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else paintDrop(x, y + s * 0.55 + r * 1.1, r, c.next.hex);
    }
    const puff = () => {
      ctx.beginPath();
      ctx.arc(x - s * 0.95, y + s * 0.2, s * 0.7, 0, Math.PI * 2);
      ctx.arc(x - s * 0.15, y - s * 0.3, s * 0.95, 0, Math.PI * 2);
      ctx.arc(x + s * 0.8, y + s * 0.05, s * 0.8, 0, Math.PI * 2);
      ctx.rect(x - s * 0.95, y + s * 0.2, s * 1.75, s * 0.7);
    };
    inkShadow(puff, 3, 5);
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    puff();
    ctx.stroke();
    ctx.fillStyle = CARD;
    puff();
    ctx.fill(); // over the stroke, so the arcs inside vanish
    // a face like Клякса's
    ctx.fillStyle = 'rgba(255,152,167,.55)';
    for (const e of [-0.62, 0.42]) {
      ctx.beginPath();
      ctx.ellipse(x + e * s, y + s * 0.18, s * 0.16, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = INK;
    for (const e of [-0.4, 0.2]) {
      ctx.beginPath();
      ctx.ellipse(x + e * s, y - s * 0.05, s * 0.09, s * (c.release ? 0.05 : 0.12), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawShelf(groundY: number) {
    const { shelfX0: x0, shelfX1: x1 } = L;
    const y = groundY, h = PLANK;
    const plank = () => {
      ctx.beginPath();
      ctx.roundRect(x0, y, x1 - x0, h, 14);
    };
    inkShadow(plank, 0, 6);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#F0B47B');
    g.addColorStop(1, '#EAA66A');
    plank();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    plank();
    ctx.clip();
    ctx.fillStyle = 'rgba(43,35,64,.12)';
    for (let px = x0 + 120; px < x1; px += 123) ctx.fillRect(px, y, 3, h);
    ctx.fillStyle = 'rgba(43,35,64,.08)';
    ctx.fillRect(x0, y + h * 0.45, x1 - x0, h * 0.07);
    // paint that missed the bucket stays on the shelf
    for (const s of splats) {
      wobbly(OX + s.x * PW, y + 3, s.r, s.r * 0.42, (a) => 1 + 0.18 * Math.sin(a * 7 + s.seed * 10) + 0.08 * Math.sin(a * 3 + s.seed * 4));
      ctx.fillStyle = s.hex;
      ctx.fill();
    }
    ctx.restore();
    plank();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function drawMouse(groundY: number) {
    if (!mouse) return;
    const s = Math.max(14, Math.min(22, PW * 0.035));
    ctx.save();
    const { shelfX0: x0, shelfX1: x1 } = L;
    ctx.translate(x0 + mouse.x * (x1 - x0), groundY - 1 - Math.abs(Math.sin(time * 18)) * 3);
    ctx.scale(mouse.dir, 1); // drawn facing right
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath(); // tail
    ctx.moveTo(-s * 1.1, -s * 0.4);
    ctx.quadraticCurveTo(-s * 2, -s * 1.4 + Math.sin(time * 12) * 4, -s * 2.4, -s * 0.6);
    ctx.stroke();
    // the mop: a stick held forward and a wet head sweeping the shelf
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(s * 0.4, -s * 1.3);
    ctx.lineTo(s * 2.1, -s * 0.1);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#C9874E';
    ctx.stroke();
    ctx.fillStyle = '#7FB3E6';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(s * 1.75 + i * s * 0.18, s * 0.02 + Math.sin(time * 20 + i) * 1.5, s * 0.14, s * 0.3, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#B7B0C6';
    ctx.lineWidth = 3;
    ctx.beginPath(); // body
    ctx.ellipse(0, -s * 0.55, s * 1.15, s * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath(); // head
    ctx.ellipse(s * 0.95, -s * 0.85, s * 0.55, s * 0.45, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FF98A7';
    ctx.beginPath(); // ear
    ctx.arc(s * 0.75, -s * 1.35, s * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath(); // nose
    ctx.arc(s * 1.47, -s * 0.78, s * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath(); // eye
    ctx.arc(s * 1.08, -s * 0.95, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.beginPath(); // running feet
    for (const f of [-0.5, 0.5]) {
      ctx.moveTo(f * s, -s * 0.05);
      ctx.lineTo(f * s + Math.sin(time * 18 + f * 3) * 4, s * 0.12);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The bucket on Клякса's head, filled with the mix so far. */
  function drawBucket() {
    const { bw, bh } = L;
    const bTop = L.bTop + hop, bBot = L.bBot + hop;
    const x = OX + bx * PW;
    const tw = bw / 2, bwb = bw * 0.39, rr = bw * 0.1;
    const rimH = bw * 0.13;
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(x - tw * 0.94, bTop + rimH * 0.5);
      ctx.lineTo(x + tw * 0.94, bTop + rimH * 0.5);
      ctx.lineTo(x + bwb, bBot - rr);
      ctx.quadraticCurveTo(x + bwb, bBot, x + bwb - rr, bBot);
      ctx.lineTo(x - bwb + rr, bBot);
      ctx.quadraticCurveTo(x - bwb, bBot, x - bwb, bBot - rr);
      ctx.closePath();
    };
    ctx.save();
    if (fall) {
      ctx.translate(x + fall.dx, bBot + fall.dy);
      ctx.rotate(fall.rot);
      ctx.translate(-x, -bBot);
    }
    // a splash squashes the bucket for a moment, and it springs back
    const squash = bumpT < 0.6 ? Math.exp(-bumpT * 8) * Math.cos(bumpT * 30) : 0;
    if (squash) {
      ctx.translate(x, bBot);
      ctx.scale(1 + 0.06 * squash, 1 - 0.09 * squash);
      ctx.translate(-x, -bBot);
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // handle, lying back behind the bucket
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.ellipse(x, bTop + rimH * 0.5, tw * 0.8, bh * 0.45, 0, Math.PI, Math.PI * 2);
    ctx.stroke();

    body();
    ctx.fillStyle = '#E4ECF5';
    ctx.fill();
    const inner = bBot - (bTop + rimH);
    const surface = bBot - inner * shownFill;
    const hex = mixHex(shown);
    ctx.save();
    body();
    ctx.clip();
    if (hex) {
      const color = tint.t < 1 ? mixHexes(tint.from, tint.to, 1 - (1 - tint.t) ** 3) : hex;
      const amp = 2 + slosh * 5;
      const wave = (i: number) => surface + Math.sin(i * 0.8 + time * 5) * amp * (1 - Math.abs(i - 12) / 30);
      const paint = () => {
        ctx.beginPath();
        ctx.moveTo(x - tw, bBot + 2);
        for (let i = 0; i <= 24; i++) ctx.lineTo(x - tw + (i / 24) * bw, wave(i));
        ctx.lineTo(x + tw, bBot + 2);
        ctx.closePath();
      };
      paint();
      ctx.fillStyle = color;
      ctx.fill();
      // each new color swirls into the mix and fades into it
      ctx.save();
      paint();
      ctx.clip();
      for (const w of swirls) {
        const p = w.t / 0.9;
        const cx = x + w.dx * (1 - p * 0.7);
        const cy = surface + (bBot - surface) * (0.25 + p * 0.25);
        ctx.globalAlpha = (1 - p) ** 1.3;
        ctx.strokeStyle = w.hex;
        ctx.lineCap = 'round';
        for (let arm = 0; arm < 2; arm++) {
          ctx.lineWidth = Math.max(1, bw * 0.09 * (1 - p));
          ctx.beginPath();
          for (let i = 0; i <= 14; i++) {
            const a = w.spin * (p * 5 + i * 0.35) + arm * Math.PI;
            const rad = bw * (0.04 + 0.022 * i) * (0.6 + p);
            const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad * 0.4;
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.strokeStyle = shade(color, 0.35);
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const px = x - tw + (i / 24) * bw;
        i ? ctx.lineTo(px, wave(i)) : ctx.moveTo(px, wave(i));
      }
      ctx.stroke();
      // rings spread over the surface where a drop went in
      for (const r of ripples) {
        const p = r.t / 0.6;
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = shade(color, 0.5);
        ctx.lineWidth = 2.5 * (1 - p) + 0.5;
        ctx.beginPath();
        ctx.ellipse(x + r.dx, surface + 1, bw * (0.08 + 0.32 * p), bw * (0.025 + 0.07 * p), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // drops on their way down through the glass
    for (const d of sinking) {
      const k = Math.min(1.25, 1 + d.vy / 3000);
      ctx.save();
      ctx.translate(x + d.dx, bBot + d.y);
      ctx.scale(1 / Math.sqrt(k), k); // stretched by the speed
      paintDrop(0, 0, d.r * 0.9, d.kind.hex);
      ctx.restore();
    }
    ctx.restore();
    // gloss, like on the jars
    ctx.save();
    body();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath();
    ctx.roundRect(x - tw * 0.62, bTop + rimH + bh * 0.08, bw * 0.08, bh * 0.62, bw * 0.04);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath();
    ctx.roundRect(x - tw * 0.4, bTop + rimH + bh * 0.08, bw * 0.035, bh * 0.3, bw * 0.02);
    ctx.fill();
    ctx.restore();
    // a tick per drop the bucket holds
    ctx.strokeStyle = 'rgba(43,35,64,.3)';
    ctx.lineWidth = 2;
    const cap = capacity();
    ctx.beginPath();
    for (let i = 1; i < cap; i++) {
      const y = bBot - (inner * i) / cap;
      const hw = tw * 0.94 + (bwb - tw * 0.94) * ((y - bTop) / bh);
      ctx.moveTo(x + hw - 9, y);
      ctx.lineTo(x + hw - 4, y);
    }
    ctx.stroke();
    body();
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // rim
    ctx.beginPath();
    ctx.roundRect(x - tw - 2, bTop, bw + 4, rimH, rimH / 2);
    ctx.fillStyle = CARD;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.lineCap = 'butt';
    // droplets jumping out of the paint
    for (const q of splashes) {
      ctx.fillStyle = q.hex;
      ctx.beginPath();
      ctx.arc(x + q.dx, bBot + q.y, q.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    const { cloudY, groundY, bTop } = L;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (shakeT) ctx.translate(Math.sin(time * 80) * 6 * (shakeT / 0.3), 0);

    for (const c of clouds) for (const shift of [-1, 0, 1]) drawCloud(c, cloudY, shift);
    for (const d of drops) drawDrop(d);
    drawShelf(groundY);
    drawBucket();
    drawMouse(groundY);
    for (const q of parts) {
      ctx.fillStyle = q.hex;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
      const size = f.big ? 24 : 17;
      ctx.font = `800 ${size}px ${DISPLAY}`;
      const fx = Math.max(90, Math.min(W - 90, OX + f.x * PW));
      const fy = f.y - f.t * 40;
      ctx.lineWidth = size * 0.3;
      ctx.strokeStyle = INK;
      ctx.strokeText(f.text, fx, fy);
      ctx.fillStyle = f.hex;
      ctx.fillText(f.text, fx, fy);
    }
    ctx.globalAlpha = 1;

    const next = drops.filter((d) => d.y < bTop).sort((a, b) => b.y - a.y)[0];
    opts.frame({
      x: OX + bx * PW,
      groundY,
      width: L.bw,
      look: next ? { x: OX + next.x * PW, y: next.y } : null,
      shelfRight: L.shelfX1,
      hop,
    });
  }

  // ---------- loop ----------
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

  return {
    start,
    snapshot,
    resize,
    pour,
    get phase() {
      return phase;
    },
    get paused() {
      return paused;
    },
    set paused(on: boolean) {
      paused = on && (phase === 'play' || phase === 'won');
    },
    pointer(clientX: number | null) {
      aim = clientX === null ? null : (clientX - canvas.getBoundingClientRect().left - OX) / PW;
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
