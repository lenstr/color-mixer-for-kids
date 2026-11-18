// Coloring page: mix paint on the brush blob with the jars, or pick a color
// the kid has already found, then tap a part of the picture and the paint
// spreads from the finger. Modes (coloring/rules.ts) decide whether hint
// dots show the real colors and whether a wrong color sticks.

import { type Drops, type Pigment, PIGMENTS, distance, emptyDrops, mixHex, totalDrops } from '../color';
import {
  COLOR_BY_ID,
  MATCH,
  MAX_DROPS,
  MIX_COLORS,
  type NamedColor,
  shelfPaints,
  PAINT_BY_ID,
  basicColors,
  colorLabel,
  nearest,
  suggest,
} from '../data';
import type { Picture, Region } from '../coloring/pictures';
import { emptyFill, pictureSVG, rasterize } from '../coloring/render';
import { type Anchor, anchors } from '../coloring/anchors';
import { MODES, isComplete, isPerfect } from '../coloring/rules';
import { PaintBlob, swatchSVG } from '../blob';
import { jarShelf } from '../jar';
import { type Point, clearEffects, flyDrop, jarMouth, reduced, splash } from '../effects';
import { icon } from '../icons';
import { sfx } from '../audio';
import { preload, say } from '../speech';
import { type Artwork, type PaintMode, store } from '../storage';
import { burst, warmup } from '../confetti';
import { $, type Route, type Screen, html, restartClass, speechBubble, toast, topBar } from '../ui';

/** A picture painted as part of the story, with its own rules. */
export interface PaintStory {
  mode: PaintMode;
  back: Route;
  /** phrase id said when the screen opens */
  intro: string;
  /** whether the hint button helps here */
  hints: boolean;
  /**
   * runs once the picture is complete, and on opening a complete one, since
   * leaving the screen right after the last stroke cancels the call;
   * `screen` holds whatever it shows next
   */
  done(screen: HTMLElement): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const UNDO_LIMIT = 40;

/** A wobbly paint splat of radius ~1, scaled up from the tap point. */
const SPLAT = (() => {
  const N = 48;
  let d = '';
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 0.86 + 0.1 * Math.sin(5 * a) + 0.05 * Math.sin(11 * a + 1);
    d += `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(3)} ${(Math.sin(a) * r).toFixed(3)}`;
  }
  return `${d}Z`;
})();

/** Pigments of a recipe as a drop history, so undo works on a picked color too. */
const historyOf = (d: Drops) => PIGMENTS.flatMap((p) => Array<Pigment>(d[p]).fill(p));

export function paintScreen(pic: Picture, story?: PaintStory): Screen {
  const mode = story?.mode ?? store.paintMode;
  const modeInfo = MODES.find((m) => m.id === mode)!;
  const regionById = new Map(pic.regions.map((r) => [r.id, r]));
  const art: Artwork = store.artwork(pic.id);
  // keep marks only for parts that still exist and are painted
  art.ok = art.ok.filter((id) => art.fills[id] && regionById.has(id));
  const undoStack: Artwork[] = [];

  let drops = emptyDrops();
  let history: Pigment[] = [];
  let inFlight = 0;
  let lastWrong: Region | null = null;
  let clearTimer = 0;
  let doneTimer = 0;

  const root = html(`<section class="screen paint is-${mode}"></section>`);
  root.append(
    topBar(
      pic.name,
      story?.back ?? { name: 'coloring' },
      `<span class="mode-chip" title="${modeInfo.name}">${modeInfo.icon}<span>${modeInfo.name}</span></span>`,
    ),
  );

  const grid = html(`
    <div class="mixer-grid">
      <div class="stage paint-stage">
        <div class="picture-wrap">${pictureSVG(pic, art.fills, { dotted: true, interactive: true })}</div>
        <div class="paint-tools">
          <button class="paint-tool" data-act="undo" aria-label="Отменить">${icon.undo}<span>Назад</span></button>
          <button class="paint-tool" data-act="clear" aria-label="Стереть всё">${icon.eraser}<span>Стереть</span></button>
          <button class="paint-tool" data-act="save" aria-label="Сохранить картинку">${icon.download}<span>Сохранить</span></button>
        </div>
      </div>
      <aside class="side">
        <div class="card brush-card">
          <div class="card-kicker">Кисточка</div>
          <div class="brush-blob"><div class="bubble" aria-live="polite"></div></div>
          <div class="brush-name readout-name"></div>
          <div class="my-colors" role="group" aria-label="Мои цвета"></div>
          <button class="btn btn-hint" data-hint>${icon.bulb}<span>Подсказка</span></button>
        </div>
      </aside>
      <div class="shelf">
        <button class="tool" data-tool="undo" aria-label="Убрать каплю">${icon.undo}<span>Убрать</span></button>
        <div class="jars"></div>
        <button class="tool" data-tool="pour" aria-label="Вылить краску">${icon.pour}<span>Вылить</span></button>
      </div>
    </div>`);
  root.append(grid);

  const svg = $<SVGSVGElement>(grid, '.picture-svg');
  const EMPTY = emptyFill(svg);
  const brushBlobEl = $(grid, '.brush-blob');
  const bubble = $(grid, '.bubble');
  const nameEl = $(grid, '.brush-name');
  const myColors = $(grid, '.my-colors');
  const hintBtn = $<HTMLButtonElement>(grid, '[data-hint]');
  const jarsEl = $(grid, '.jars');
  const dropUndoBtn = $<HTMLButtonElement>(grid, '[data-tool="undo"]');
  const pourBtn = $<HTMLButtonElement>(grid, '[data-tool="pour"]');
  const undoBtn = $<HTMLButtonElement>(grid, '[data-act="undo"]');
  const clearBtn = $<HTMLButtonElement>(grid, '[data-act="clear"]');
  const saveBtn = $<HTMLButtonElement>(grid, '[data-act="save"]');
  hintBtn.hidden = mode === 'free' || story?.hints === false;

  const speech = speechBubble(bubble);
  const showBubble = speech.show;

  const blob = new PaintBlob({ face: true, color: null, seed: 5 });
  brushBlobEl.prepend(blob.el);
  blob.setBaseMood('hungry');

  // ---------- picture ----------

  const parts = new Map(
    pic.regions.map((r) => {
      const g = svg.querySelector<SVGGElement>(`.region[data-id="${r.id}"]`)!;
      return [r.id, { g, fill: g.querySelector<SVGPathElement>('.region-fill')!, spread: g.querySelector('.region-spread')! }];
    }),
  );
  const part = (id: string) => parts.get(id)!;
  const complete = () => isComplete(pic, art);
  const perfect = () => isPerfect(pic, art);

  // hint dots over everything, at each region's deepest point
  const hintLayer = document.createElementNS(SVG_NS, 'g');
  hintLayer.classList.add('hints');
  hintLayer.setAttribute('pointer-events', 'none');
  svg.querySelector('.deco')!.after(hintLayer);
  void anchors(pic).then((spots) => {
    for (const r of pic.regions) addHintDot(r, spots[r.id]);
    paintHints();
  });
  function addHintDot(r: Region, a: Anchor) {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.classList.add('hint-dot');
    dot.dataset.id = r.id;
    dot.setAttribute('cx', String(a.x));
    dot.setAttribute('cy', String(a.y));
    dot.setAttribute('r', String(Math.max(4, Math.min(11, a.room * 0.55))));
    dot.setAttribute('fill', COLOR_BY_ID[r.target].hex);
    hintLayer.append(dot);
  }

  function paintHints() {
    hintLayer.querySelectorAll<SVGCircleElement>('.hint-dot').forEach((d) => {
      d.classList.toggle('is-done', art.ok.includes(d.dataset.id!));
    });
  }

  /** Shows a part's hint dot, which the task mode keeps hidden until needed. */
  function revealDot(id: string) {
    hintLayer.querySelector(`[data-id="${id}"]`)?.classList.add('is-shown', 'is-wanted');
  }

  function pushUndo() {
    undoStack.push({ fills: { ...art.fills }, ok: [...art.ok] });
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    undoBtn.disabled = false;
  }

  function persist() {
    store.saveArtwork(pic.id, art);
    paintHints();
    undoBtn.disabled = !undoStack.length;
  }

  /** Repaints the parts that differ from `before`, after undo or clear. */
  function redraw(before: Record<string, string>) {
    for (const r of pic.regions) {
      if (before[r.id] === art.fills[r.id]) continue;
      const el = part(r.id).fill;
      el.setAttribute('fill', art.fills[r.id] ?? EMPTY);
      el.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 300 });
    }
  }

  function addSplat(r: Region, hex: string) {
    const splat = document.createElementNS(SVG_NS, 'path');
    splat.setAttribute('d', SPLAT);
    splat.setAttribute('fill', hex);
    part(r.id).spread.append(splat);
    return splat;
  }

  const spreadToken = new Map<string, number>();

  /** Paint flows out of `at` (artboard units) until it covers the region. */
  function spread(r: Region, at: DOMPoint, hex: string, done: () => void) {
    const token = (spreadToken.get(r.id) ?? 0) + 1;
    spreadToken.set(r.id, token);
    const { fill, spread: layer } = part(r.id);
    const splat = addSplat(r, hex);
    const box = fill.getBBox();
    const far = Math.max(
      ...[
        [box.x, box.y],
        [box.x + box.width, box.y],
        [box.x, box.y + box.height],
        [box.x + box.width, box.y + box.height],
      ].map(([x, y]) => Math.hypot(x - at.x, y - at.y)),
    );
    const scale = far * 1.2;
    const duration = reduced() ? 1 : Math.min(950, 380 + scale * 1.3);
    const t = (s: number, deg: number) => `translate(${at.x}px, ${at.y}px) rotate(${deg}deg) scale(${s})`;
    splat.animate([{ transform: t(0.5, 0) }, { transform: t(scale, 50) }], {
      duration,
      easing: 'cubic-bezier(.15,.75,.3,1)',
    }).onfinish = () => {
      if (spreadToken.get(r.id) === token) {
        fill.setAttribute('fill', hex);
        layer.replaceChildren();
      } else splat.remove();
      done();
    };
  }

  /** Wrong color in task mode: the paint lands, then shrinks away. */
  function bounce(r: Region, at: DOMPoint, hex: string) {
    const splat = addSplat(r, hex);
    const t = (s: number) => `translate(${at.x}px, ${at.y}px) scale(${s})`;
    splat.animate(
      [
        { transform: t(0.5), opacity: 1 },
        { transform: t(26), opacity: 1, offset: 0.35 },
        { transform: t(22), opacity: 0.9, offset: 0.6 },
        { transform: t(0.5), opacity: 0 },
      ],
      { duration: 700, easing: 'ease-in-out' },
    ).onfinish = () => splat.remove();
    part(r.id).g.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(5px)' },
        { transform: 'translateX(-3px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 360, delay: 120 },
    );
  }

  function toArtboard(e: MouseEvent) {
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
  }

  svg.addEventListener('click', (e) => {
    const g = (e.target as Element).closest<SVGGElement>('.region');
    if (!g) return;
    paintRegion(regionById.get(g.dataset.id!)!, toArtboard(e), { x: e.clientX, y: e.clientY });
  });

  function paintRegion(r: Region, at: DOMPoint, page: Point) {
    clearHints();
    const hex = mixHex(drops);
    if (!hex) {
      sfx.full();
      blob.shake();
      showBubble('Набери краску!');
      jarBtns.forEach((b) => b.classList.add('is-hinted'));
      say('need-paint');
      return;
    }
    const target = COLOR_BY_ID[r.target];
    const ok = distance(drops, target.recipe) < MATCH;
    blob.react(ok || mode === 'free' ? 'happy' : 'smile', 600);
    blob.wiggle(2);

    if (mode === 'task' && !ok) {
      lastWrong = r;
      flyDrop(blob.mouthPoint(), page, hex, () => {
        sfx.full();
        bounce(r, at, hex);
        showBubble(`Сюда нужен <b style="--c:${target.hex}">${target.name.toLowerCase()}</b>`);
        revealDot(r.id);
        say('wrong-color');
      }, 320);
      return;
    }

    const was = { complete: complete(), perfect: perfect() };
    pushUndo();
    art.fills[r.id] = hex;
    art.ok = art.ok.filter((id) => id !== r.id);
    if (ok) art.ok.push(r.id);
    if (r === lastWrong) lastWrong = null;
    persist();

    flyDrop(blob.mouthPoint(), page, hex, () => {
      sfx.plop(dominant(drops));
      splash(page, hex, 7);
      spread(r, at, hex, () => afterPaint(r, ok, page, was));
    }, 320);
  }

  /** Cheers once the picture becomes complete or perfect with this stroke. */
  function afterPaint(r: Region, ok: boolean, page: Point, was: { complete: boolean; perfect: boolean }) {
    if (ok && mode !== 'free') {
      sfx.star(Math.min(art.ok.length % 4, 3));
      burst([COLOR_BY_ID[r.target].hex, '#FFD21F', '#FFFDF7'], { ...page, count: 14 });
    }
    if (!was.perfect && perfect()) celebrate(true);
    else if (!was.complete && complete()) celebrate(false);
  }

  function celebrate(exact: boolean) {
    sfx.win();
    blob.setBaseMood('happy');
    blob.react('happy', 3000);
    blob.jump();
    const box = svg.getBoundingClientRect();
    const colors = [...new Set(Object.values(art.fills))];
    burst([...colors, '#FFD21F'], { x: box.left + box.width / 2, y: box.top + box.height * 0.35, count: 110 });
    showBubble(exact ? 'Все цвета как настоящие!' : 'Готово! Красота!', 3600);
    say(exact ? 'picture-perfect' : 'picture-done');
    saveBtn.classList.add('is-hinted');
    restartClass(svg, 'is-cheering');
    if (story) doneTimer = window.setTimeout(() => story.done(root), 2600);
  }

  const dominant = (d: Drops) => PIGMENTS.reduce((a, b) => (d[b] > d[a] ? b : a));

  // ---------- picture tools ----------

  undoBtn.disabled = true;
  undoBtn.addEventListener('click', () => {
    const prev = undoStack.pop();
    if (!prev) return;
    sfx.undo();
    const before = art.fills;
    art.fills = prev.fills;
    art.ok = prev.ok;
    redraw(before);
    persist();
  });

  clearBtn.addEventListener('click', () => {
    if (!Object.keys(art.fills).length) return;
    if (!clearBtn.classList.contains('is-armed')) {
      sfx.tap();
      clearBtn.classList.add('is-armed');
      $(clearBtn, 'span').textContent = 'Точно?';
      clearTimer = window.setTimeout(disarmClear, 3000);
      return;
    }
    disarmClear();
    pushUndo();
    const before = art.fills;
    art.fills = {};
    art.ok = [];
    sfx.pour();
    redraw(before);
    persist();
  });
  function disarmClear() {
    clearTimeout(clearTimer);
    clearBtn.classList.remove('is-armed');
    $(clearBtn, 'span').textContent = 'Стереть';
  }

  saveBtn.addEventListener('click', async () => {
    saveBtn.classList.remove('is-hinted');
    sfx.tap();
    try {
      const blob = await renderPNG(pic, art.fills);
      const file = new File([blob], `klyaksa-${pic.id}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: pic.name });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      }
      sfx.discover();
      showBubble('Картинка сохранена!');
    } catch {
      /* the share sheet was dismissed */
    }
  });

  // ---------- brush ----------

  const shelf = shelfPaints(store.gold);
  const jarBtns = jarShelf(jarsEl, shelf, (p) => addDrop(p, jarBtns.get(p)!));

  function addDrop(p: Pigment, jar: HTMLElement) {
    if (totalDrops(drops) >= MAX_DROPS) {
      sfx.full();
      blob.shake();
      showBubble('Я уже полная! Вылей краску');
      pourBtn.classList.add('is-hinted');
      say('full');
      return;
    }
    clearHints();
    drops = { ...drops, [p]: drops[p] + 1 };
    history.push(p);
    const snapshot = { ...drops };
    const paint = PAINT_BY_ID[p];
    sfx.squeeze(p);
    restartClass(jar, 'is-squeezed');
    blob.expect();
    inFlight++;
    renderBrush();
    flyDrop(jarMouth(jar), blob.mouthPoint(), paint.hex, () => {
      inFlight--;
      paintTools();
      sfx.plop(p);
      blob.eat(paint.hex, mixHex(snapshot));
      splash(blob.mouthPoint(), paint.hex);
      discover(snapshot);
    });
  }

  function discover(d: Drops) {
    const n = nearest(d);
    if (!n || n.dist >= MATCH || n.color.basic || !store.discover(n.color.id)) return;
    sfx.discover();
    blob.jump();
    toast('Новый цвет!', n.color.name, n.color.hex);
    say(`found-${n.color.id}`);
    if (store.discoveredCount() === MIX_COLORS.length) setTimeout(() => say('all-found'), 2200);
    renderMyColors();
  }

  function setBrush(d: Drops, hex: string | null) {
    drops = d;
    history = historyOf(d);
    blob.setColor(hex, { duration: 450 });
    renderBrush();
  }

  dropUndoBtn.addEventListener('click', () => {
    if (!history.length || inFlight) return;
    clearHints();
    const p = history.pop()!;
    drops = { ...drops, [p]: drops[p] - 1 };
    sfx.undo();
    blob.wiggle(-3);
    blob.setColor(mixHex(drops), { duration: 450 });
    renderBrush();
  });

  pourBtn.addEventListener('click', () => {
    if (!totalDrops(drops) || inFlight) return;
    clearHints();
    sfx.pour();
    blob.shake();
    setBrush(emptyDrops(), null);
  });

  function renderMyColors() {
    const colors = [...basicColors(store.gold), ...MIX_COLORS.filter((c) => store.isDiscovered(c.id))];
    myColors.innerHTML = colors
      .map(
        (c) =>
          `<button class="my-color" data-color="${c.id}" style="--c:${c.hex}" aria-label="${c.name}" title="${c.name}">${swatchSVG(c.hex, c.id.length * 7)}</button>`,
      )
      .join('');
    myColors.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((b) =>
      b.addEventListener('click', () => pickColor(COLOR_BY_ID[b.dataset.color!])),
    );
    markPicked();
  }

  function pickColor(c: NamedColor) {
    if (inFlight) return;
    clearHints();
    sfx.squeeze(dominant(c.recipe));
    blob.eat(c.hex, c.hex);
    setBrush({ ...c.recipe }, c.hex);
    say(`name-${c.id}`);
  }

  function markPicked() {
    myColors.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((b) => {
      const c = COLOR_BY_ID[b.dataset.color!];
      b.classList.toggle('is-on', totalDrops(drops) > 0 && distance(drops, c.recipe) < MATCH);
    });
  }

  /** Undo and pour wait for drops in flight, as in the mixer, and say so by graying out. */
  function paintTools() {
    dropUndoBtn.disabled = !history.length || inFlight > 0;
    pourBtn.disabled = !totalDrops(drops) || inFlight > 0;
  }

  function renderBrush() {
    const total = totalDrops(drops);
    const hex = mixHex(drops);
    if (!total) {
      nameEl.textContent = 'Набери краску';
      nameEl.style.setProperty('--c', 'transparent');
    } else {
      nameEl.textContent = colorLabel(drops);
      nameEl.style.setProperty('--c', hex);
    }
    restartClass(nameEl, 'pop');
    paintTools();
    blob.setBaseMood(total ? 'smile' : 'hungry');
    markPicked();
  }

  // ---------- hints ----------

  function clearHints() {
    jarBtns.forEach((b) => b.classList.remove('is-hinted'));
    dropUndoBtn.classList.remove('is-hinted');
    pourBtn.classList.remove('is-hinted');
    myColors.querySelectorAll('.is-hinted').forEach((b) => b.classList.remove('is-hinted'));
    svg.querySelectorAll('.is-hinted, .is-wanted').forEach((n) => n.classList.remove('is-hinted', 'is-wanted'));
  }

  hintBtn.addEventListener('click', () => {
    const r = lastWrong ?? pic.regions.find((x) => !art.ok.includes(x.id));
    clearHints();
    sfx.hint();
    if (!r) {
      showBubble('Все цвета уже точные!');
      return;
    }
    const target = COLOR_BY_ID[r.target];
    svg
      .querySelectorAll(`.region[data-id="${r.id}"], .region-over[data-id="${r.id}"]`)
      .forEach((g) => g.classList.add('is-hinted'));
    revealDot(r.id);
    myColors.querySelector(`[data-color="${target.id}"]`)?.classList.add('is-hinted');
    const s = suggest(drops, history, target.recipe);
    const lines = [`name-${target.id}`];
    if (s.kind === 'add') {
      jarBtns.get(s.pigment)!.classList.add('is-hinted');
      lines.push(`add-${s.pigment}`);
    } else if (s.kind === 'undo') {
      dropUndoBtn.classList.add('is-hinted');
      lines.push('too-much');
    } else if (s.kind === 'pour') {
      pourBtn.classList.add('is-hinted');
      lines.push('start-over');
    }
    const tail = s.kind === 'done' ? ' Нажми на картинку!' : '';
    showBubble(`Здесь нужен <b style="--c:${target.hex}">${target.name.toLowerCase()}</b>${tail}`, 3600);
    say(...lines);
  });

  // ---------- keyboard ----------

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
    const idx = Number(e.key) - 1;
    if (idx >= 0 && idx < shelf.length) addDrop(shelf[idx].id, jarBtns.get(shelf[idx].id)!);
    else if (e.key === 'z' && (e.metaKey || e.ctrlKey)) undoBtn.click();
    else if (e.key === 'Backspace') dropUndoBtn.click();
    else if (e.key === 'Delete') pourBtn.click();
  };

  return {
    el: root,
    mount() {
      renderMyColors();
      renderBrush();
      paintHints();
      warmup();
      window.addEventListener('keydown', onKey);
      const intro = story?.intro ?? `paint-${pic.id}`;
      preload([intro, 'need-paint', 'wrong-color', 'picture-done', 'picture-perfect']);
      setTimeout(() => {
        showBubble(`Раскрась ${pic.acc}!`);
        say(intro);
      }, 400);
      if (story && complete()) doneTimer = window.setTimeout(() => story.done(root), 400);
    },
    destroy() {
      blob.destroy();
      clearEffects();
      speech.dispose();
      clearTimeout(clearTimer);
      clearTimeout(doneTimer);
      window.removeEventListener('keydown', onKey);
    },
  };
}

/** The picture as a PNG on paper, for saving or sharing. */
async function renderPNG(pic: Picture, fills: Record<string, string>): Promise<Blob> {
  const size = 1200;
  const canvas = await rasterize(pictureSVG(pic, fills, { size }), size);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}
