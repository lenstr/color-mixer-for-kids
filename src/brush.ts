// The paint the blob holds, shared by the studio and the coloring page: a
// shelf of jars between an undo and a pour tool, the drops on the blob and
// the order they came in, drops still flying, hints on the shelf, keys and
// newly found colors. Each screen adds its own readout and reactions.

import { type Drops, type Pigment, PIGMENTS, emptyDrops, mixHex, totalDrops } from './color';
import {
  MATCH,
  MAX_DROPS,
  MIX_COLORS,
  type NamedColor,
  PAINT_BY_ID,
  type PaintInfo,
  type Suggestion,
  nearest,
} from './data';
import type { PaintBlob } from './blob';
import { jarShelf } from './jar';
import { flyDrop, jarMouth, splash } from './effects';
import { icon } from './icons';
import { sfx } from './audio';
import { say } from './speech';
import { store } from './storage';
import { $, html, restartClass, toast } from './ui';

export interface BrushOptions {
  paints: PaintInfo[];
  blob: PaintBlob;
  /** shows a line in the screen's speech bubble */
  bubble(text: string): void;
  /** whether the brush takes changes now; a won level says no */
  enabled?(): boolean;
  /** a drop left its jar and is already counted */
  onAdd?(): void;
  /** a drop reached the blob; `mix` is the paint as it was when it left */
  onLanded(mix: Drops): void;
  /** drops went away or were replaced: undo, pour, set */
  onChange?(): void;
  /** clears the screen's own hints along with the shelf's */
  onClearHints?(): void;
  /** Ctrl+Z or Cmd+Z; takes back the last drop unless the screen undoes something else */
  onCtrlZ?(): void;
}

/** Pigments of a recipe as a drop history, so undo works on a picked color too. */
const historyOf = (d: Drops) => PIGMENTS.flatMap((p) => Array<Pigment>(d[p]).fill(p));

export function paintBrush(o: BrushOptions) {
  let drops = emptyDrops();
  let history: Pigment[] = [];
  let inFlight = 0;
  const enabled = () => o.enabled?.() ?? true;

  const el = html(`
    <div class="shelf">
      <button class="tool" data-tool="undo" aria-label="Убрать каплю">${icon.undo}<span>Убрать</span></button>
      <div class="jars"></div>
      <button class="tool" data-tool="pour" aria-label="Вылить краску">${icon.pour}<span>Вылить</span></button>
    </div>`);
  const undoBtn = $<HTMLButtonElement>(el, '[data-tool="undo"]');
  const pourBtn = $<HTMLButtonElement>(el, '[data-tool="pour"]');
  const jars = jarShelf($(el, '.jars'), o.paints, add);
  undoBtn.addEventListener('click', undo);
  pourBtn.addEventListener('click', pour);

  /** Undo and pour wait for the drops in flight, and say so by graying out. */
  function syncTools() {
    undoBtn.disabled = !history.length || inFlight > 0;
    pourBtn.disabled = !totalDrops(drops) || inFlight > 0;
  }
  syncTools();

  function clearHints() {
    jars.forEach((b) => b.classList.remove('is-hinted'));
    undoBtn.classList.remove('is-hinted');
    pourBtn.classList.remove('is-hinted');
    o.onClearHints?.();
  }

  function add(p: Pigment) {
    if (!enabled()) return;
    if (totalDrops(drops) >= MAX_DROPS) {
      sfx.full();
      o.blob.shake();
      o.bubble('Я уже полная! Вылей краску');
      pourBtn.classList.add('is-hinted');
      say('full');
      return;
    }
    clearHints();
    drops = { ...drops, [p]: drops[p] + 1 };
    history.push(p);
    const mix = { ...drops };
    const jar = jars.get(p)!;
    const { hex } = PAINT_BY_ID[p];
    sfx.squeeze(p);
    restartClass(jar, 'is-squeezed');
    o.blob.expect();
    inFlight++;
    syncTools();
    o.onAdd?.();
    flyDrop(jarMouth(jar), o.blob.mouthPoint(), hex, () => {
      inFlight--;
      sfx.plop(p);
      o.blob.eat(hex, mixHex(mix));
      splash(o.blob.mouthPoint(), hex);
      syncTools();
      o.onLanded(mix);
    });
  }

  function undo() {
    if (!history.length || inFlight || !enabled()) return;
    clearHints();
    const p = history.pop()!;
    drops = { ...drops, [p]: drops[p] - 1 };
    sfx.undo();
    o.blob.wiggle(-3);
    o.blob.setColor(mixHex(drops), { duration: 450 });
    syncTools();
    o.onChange?.();
  }

  function pour() {
    if (!totalDrops(drops) || inFlight || !enabled()) return;
    clearHints();
    drops = emptyDrops();
    history = [];
    sfx.pour();
    o.blob.shake();
    o.blob.setColor(null, { duration: 700 });
    syncTools();
    o.onChange?.();
  }

  return {
    el,
    jars,
    get drops() {
      return drops;
    },
    get history() {
      return history;
    },
    get inFlight() {
      return inFlight;
    },
    clearHints,

    /** Replaces the paint with a ready mix, as a picked color. */
    set(d: Drops, hex: string | null) {
      drops = d;
      history = historyOf(d);
      o.blob.setColor(hex, { duration: 450 });
      syncTools();
      o.onChange?.();
    },

    /** Lights the jar or tool a hint suggests; returns the phrase that says it. */
    pointAt(s: Suggestion) {
      if (s.kind === 'add') {
        jars.get(s.pigment)!.classList.add('is-hinted');
        return `add-${s.pigment}`;
      }
      if (s.kind === 'undo') {
        undoBtn.classList.add('is-hinted');
        return 'too-much';
      }
      if (s.kind === 'pour') {
        pourBtn.classList.add('is-hinted');
        return 'start-over';
      }
      return null;
    },

    /** Records the color `d` makes if the kid has not found it yet; returns it, or null. */
    discover(d: Drops): NamedColor | null {
      const n = nearest(d);
      return n && n.dist < MATCH && !n.color.basic && store.discover(n.color.id) ? n.color : null;
    },

    /** Cheers a newly found color, and the whole collection with the last one. */
    cheer(c: NamedColor) {
      sfx.discover();
      o.blob.jump();
      toast('Новый цвет!', c.name, c.hex);
      say(`found-${c.id}`);
      if (store.discoveredCount() === MIX_COLORS.length) setTimeout(() => say('all-found'), 2200);
    },

    /** Keys 1–N squeeze the jars, Backspace takes a drop back, Delete pours. */
    onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < o.paints.length) add(o.paints[idx].id);
      else if (e.key === 'z' && (e.metaKey || e.ctrlKey)) (o.onCtrlZ ?? undo)();
      else if (e.key === 'Backspace') undo();
      else if (e.key === 'Delete') pour();
    },
  };
}
