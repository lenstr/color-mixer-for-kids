import { type Drops, type Pigment, PIGMENTS, distance, emptyDrops, mixHex, totalDrops } from '../color';
import { ALL_COLORS, MAX_DROPS, MIX_COLORS, PAINTS, PAINT_BY_ID, type NamedColor } from '../data';
import { PaintBlob } from '../blob';
import { swatchSVG } from '../blob';
import { dropSVG, jarSVG } from '../jar';
import { icon, starSVG } from '../icons';
import { sfx } from '../audio';
import { say, preload } from '../speech';
import { store } from '../storage';
import { burst } from '../confetti';
import { $, type Screen, go, html, plural, toast, topBar } from '../ui';

const MATCH = 2.5; // ΔE below which the mix counts as "the same color"
const NEAR = 9;

function nearest(d: Drops): { color: NamedColor; dist: number } | null {
  if (!totalDrops(d)) return null;
  let best: NamedColor = ALL_COLORS[0];
  let bestD = Infinity;
  for (const c of ALL_COLORS) {
    const dd = distance(d, c.recipe);
    if (dd < bestD) {
      bestD = dd;
      best = c;
    }
  }
  return { color: best, dist: bestD };
}

type Suggestion = { kind: 'add'; pigment: Pigment } | { kind: 'undo' } | { kind: 'pour' } | { kind: 'done' };

/**
 * What should the kid do next to reach `target`? Finds the smallest multiple
 * of the recipe that contains the current drops and points at the paint that
 * is missing the most.
 */
export function suggest(cur: Drops, history: Pigment[], target: Drops): Suggestion {
  if (distance(cur, target) < MATCH) return { kind: 'done' };
  const stray = PIGMENTS.filter((p) => cur[p] > 0 && target[p] === 0);
  if (stray.length) {
    const last = history.at(-1);
    const onlyLast = stray.length === 1 && last === stray[0] && cur[stray[0]] === 1;
    return onlyLast ? { kind: 'undo' } : { kind: 'pour' };
  }
  let k = 1;
  for (const p of PIGMENTS) if (target[p]) k = Math.max(k, Math.ceil(cur[p] / target[p]));
  if (k * totalDrops(target) > MAX_DROPS) return { kind: 'pour' };
  let best: Pigment = 'red';
  let need = -1;
  for (const p of PIGMENTS) {
    const missing = k * target[p] - cur[p];
    if (missing > need) {
      need = missing;
      best = p;
    }
  }
  return { kind: 'add', pigment: best };
}

function starsFor(actions: number, minimal: number, hinted: boolean) {
  let s = actions <= minimal ? 3 : actions <= minimal * 2 + 1 ? 2 : 1;
  if (hinted) s = Math.min(s, 2);
  return s;
}

export function mixerScreen(levelIndex: number | null): Screen {
  const level = levelIndex === null ? null : MIX_COLORS[levelIndex];
  const isLevel = !!level;

  let drops = emptyDrops();
  let history: Pigment[] = [];
  let actions = 0;
  let hinted = false;
  let won = false;
  let inFlight = 0;
  let lastSpoken = '';
  let speakTimer = 0;
  let bubbleTimer = 0;

  const root = html(`<section class="screen mixer ${isLevel ? 'is-level' : 'is-studio'}"></section>`);
  root.append(
    topBar(
      isLevel ? `Задание ${levelIndex! + 1}` : 'Мастерская',
      isLevel ? { name: 'levels' } : { name: 'home' },
    ),
  );

  const grid = html(`
    <div class="mixer-grid">
      <div class="stage">
        <div class="stage-blob">
          <div class="bubble" aria-live="polite"></div>
        </div>
        <div class="readout">
          <div class="readout-name"></div>
          <div class="equation"></div>
        </div>
      </div>
      <aside class="side"></aside>
      <div class="shelf">
        <button class="tool" data-tool="undo" aria-label="Убрать каплю">${icon.undo}<span>Убрать</span></button>
        <div class="jars"></div>
        <button class="tool" data-tool="pour" aria-label="Вылить краску">${icon.pour}<span>Вылить</span></button>
      </div>
    </div>`);
  root.append(grid);

  const stageBlob = $(grid, '.stage-blob');
  const bubble = $(grid, '.bubble');
  const nameEl = $(grid, '.readout-name');
  const eqEl = $(grid, '.equation');
  const side = $(grid, '.side');
  const jarsEl = $(grid, '.jars');
  const undoBtn = $<HTMLButtonElement>(grid, '[data-tool="undo"]');
  const pourBtn = $<HTMLButtonElement>(grid, '[data-tool="pour"]');

  const blob = new PaintBlob({ face: true, color: null, seed: 3 });
  stageBlob.prepend(blob.svg);
  blob.setBaseMood('hungry');

  // ---------- jars ----------
  const jarBtns = new Map<Pigment, HTMLButtonElement>();
  PAINTS.forEach((p, i) => {
    const b = html<HTMLButtonElement>(`
      <button class="jar" style="--paint:${p.hex}; --i:${i}" aria-label="${p.name} краска">
        <span class="jar-art">${jarSVG(p)}</span>
        <span class="jar-label">${p.name}</span>
        <span class="jar-hint">${icon.sparkle}</span>
      </button>`);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      addDrop(p.id, b);
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        addDrop(p.id, b);
      }
    });
    jarBtns.set(p.id, b);
    jarsEl.append(b);
  });

  // ---------- side panel ----------
  let meterFill: HTMLElement | null = null;
  let meterLabel: HTMLElement | null = null;
  let collectionDots: HTMLElement | null = null;

  if (level) {
    side.innerHTML = `
      <div class="card target-card">
        <div class="card-kicker">Задание ${levelIndex! + 1} из ${MIX_COLORS.length}</div>
        <div class="target-title">Сделай цвет</div>
        <div class="target-swatch" style="--c:${level.hex}">${swatchSVG(level.hex, levelIndex! + 11)}</div>
        <div class="target-name">${level.name}</div>
        <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-label="Насколько похоже">
          <div class="meter-track"><div class="meter-fill" style="--c:${level.hex}"></div></div>
          <div class="meter-label">Похоже на 0%</div>
        </div>
        <button class="btn btn-hint" data-hint>${icon.bulb}<span>Подсказка</span></button>
        <button class="replay-voice" data-say aria-label="Повторить задание">${icon.soundOn}</button>
      </div>`;
    meterFill = $<HTMLElement>(side, '.meter-fill');
    meterLabel = $<HTMLElement>(side, '.meter-label');
    $(side, '[data-hint]').addEventListener('click', giveHint);
    $(side, '[data-say]').addEventListener('click', () => say(`task-${level.id}`));
  } else {
    side.innerHTML = `
      <div class="card studio-card">
        <div class="card-kicker">Мои цвета</div>
        <div class="studio-count"></div>
        <button class="collection-dots" data-collection aria-label="Открыть коллекцию"></button>
        <button class="btn btn-hint" data-idea>${icon.bulb}<span>Идея!</span></button>
      </div>`;
    collectionDots = $<HTMLElement>(side, '.collection-dots');
    $(side, '[data-collection]').addEventListener('click', () => go({ name: 'collection' }));
    $(side, '[data-idea]').addEventListener('click', giveIdea);
    paintCollection();
  }

  function paintCollection() {
    if (!collectionDots) return;
    const n = store.discoveredCount();
    $(side, '.studio-count').innerHTML = `<b>${n}</b> из ${MIX_COLORS.length}`;
    collectionDots.innerHTML = MIX_COLORS.map((c, i) => {
      const on = store.isDiscovered(c.id);
      return `<span class="cdot ${on ? 'is-on' : ''}" style="--c:${c.hex}; --i:${i}" title="${on ? c.name : '?'}"></span>`;
    }).join('');
  }

  // ---------- readout ----------
  function renderReadout(d: Drops) {
    const total = totalDrops(d);
    const hex = mixHex(d);
    if (!total) {
      nameEl.textContent = 'Пусто';
      nameEl.style.setProperty('--c', 'transparent');
      eqEl.innerHTML = `<span class="eq-empty">Нажми на баночку с краской</span>`;
    } else {
      const n = nearest(d)!;
      let label = 'Новый оттенок';
      if (n.dist < MATCH) label = n.color.name;
      else if (n.dist < NEAR) label = `Почти ${n.color.name.toLowerCase()}`;
      nameEl.textContent = label;
      nameEl.style.setProperty('--c', hex);
      const parts = PIGMENTS.filter((p) => d[p] > 0).map(
        (p) => `<span class="eq-chip" title="${d[p]} ${plural(d[p], 'капля', 'капли', 'капель')}">
          ${dropSVG(PAINT_BY_ID[p].hex)}<b>${d[p]}</b></span>`,
      );
      eqEl.innerHTML =
        parts.join('<span class="eq-op">+</span>') +
        `<span class="eq-op">=</span><span class="eq-result">${swatchSVG(hex, 5)}</span>`;
    }
    nameEl.classList.remove('pop');
    void nameEl.offsetWidth;
    nameEl.classList.add('pop');

    if (level && meterFill && meterLabel) {
      const dist = total ? distance(d, level.recipe) : Infinity;
      const pct = dist < MATCH ? 100 : Math.max(0, Math.round(100 - dist * 2.4));
      meterFill.style.width = `${pct}%`;
      meterLabel.textContent = pct === 100 ? 'Получилось!' : `Похоже на ${pct}%`;
      meterFill.closest('.meter')!.setAttribute('aria-valuenow', String(pct));
      meterFill.closest('.meter')!.classList.toggle('is-close', pct >= 75);
    }

    undoBtn.disabled = history.length === 0;
    pourBtn.disabled = total === 0;
    blob.setBaseMood(total ? 'smile' : 'hungry');
  }

  function showBubble(text: string, ms = 2600) {
    bubble.innerHTML = text;
    bubble.classList.remove('is-on');
    void bubble.offsetWidth;
    bubble.classList.add('is-on');
    clearTimeout(bubbleTimer);
    bubbleTimer = window.setTimeout(() => bubble.classList.remove('is-on'), ms);
  }

  function clearHints() {
    jarBtns.forEach((b) => b.classList.remove('is-hinted'));
    undoBtn.classList.remove('is-hinted');
    pourBtn.classList.remove('is-hinted');
  }

  // ---------- actions ----------
  function addDrop(p: Pigment, jar: HTMLElement) {
    if (won) return;
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
    actions++;
    const snapshot = { ...drops };
    const paint = PAINT_BY_ID[p];

    sfx.squeeze(p);
    jar.classList.remove('is-squeezed');
    void jar.offsetWidth;
    jar.classList.add('is-squeezed');
    blob.expect();
    inFlight++;
    undoBtn.disabled = pourBtn.disabled = true;

    flyDrop(jar, paint.hex, () => {
      inFlight--;
      sfx.plop(p);
      blob.eat(paint.hex, mixHex(snapshot));
      splash(paint.hex);
      renderReadout(snapshot);
      if (inFlight > 0) undoBtn.disabled = pourBtn.disabled = true;
      afterMix(snapshot);
    });
  }

  function afterMix(d: Drops) {
    if (won) return;
    const n = nearest(d);
    const isNew = n && n.dist < MATCH && !n.color.basic && store.discover(n.color.id);

    if (level && distance(d, level.recipe) < MATCH && inFlight === 0) {
      win(!!isNew);
      return;
    }
    if (isNew && n) {
      sfx.discover();
      blob.jump();
      const r = blob.svg.getBoundingClientRect();
      burst([n.color.hex, '#FFD21F', '#FFFDF7'], { x: r.left + r.width / 2, y: r.top + r.height * 0.4, count: 40 });
      toast('Новый цвет!', n.color.name, n.color.hex);
      say(`found-${n.color.id}`);
      paintCollection();
      lastSpoken = n.color.id;
      if (!isLevel && store.discoveredCount() === MIX_COLORS.length) {
        setTimeout(() => say('all-found'), 2200);
      }
      return;
    }
    // Name the color out loud once the kid pauses.
    clearTimeout(speakTimer);
    speakTimer = window.setTimeout(() => {
      if (inFlight || won) return;
      const m = nearest(drops);
      if (!m) return;
      if (m.dist < MATCH && m.color.id !== lastSpoken) {
        lastSpoken = m.color.id;
        say(`name-${m.color.id}`);
      } else if (m.dist >= NEAR && lastSpoken !== 'new-shade' && totalDrops(drops) > 2) {
        lastSpoken = 'new-shade';
        say('new-shade');
      }
    }, 750);
  }

  function undo() {
    if (!history.length || inFlight || won) return;
    clearHints();
    const p = history.pop()!;
    drops = { ...drops, [p]: drops[p] - 1 };
    sfx.undo();
    blob.wiggle(-3);
    blob.setColor(mixHex(drops), { duration: 450 });
    lastSpoken = '';
    renderReadout(drops);
  }

  function pour() {
    if (!totalDrops(drops) || inFlight || won) return;
    clearHints();
    drops = emptyDrops();
    history = [];
    sfx.pour();
    blob.shake();
    blob.setColor(null, { duration: 700 });
    lastSpoken = '';
    renderReadout(drops);
  }

  undoBtn.addEventListener('click', undo);
  pourBtn.addEventListener('click', pour);

  function giveHint() {
    if (!level || won) return;
    hinted = true;
    clearHints();
    const s = suggest(drops, history, level.recipe);
    sfx.hint();
    if (s.kind === 'add') {
      const paint = PAINT_BY_ID[s.pigment];
      jarBtns.get(s.pigment)!.classList.add('is-hinted');
      showBubble(`Добавь <b style="--c:${paint.hex}">${paint.genitive}</b>!`);
      say(`add-${s.pigment}`);
    } else if (s.kind === 'undo') {
      undoBtn.classList.add('is-hinted');
      showBubble('Многовато! Убери последнюю каплю');
      say('too-much');
    } else if (s.kind === 'pour') {
      pourBtn.classList.add('is-hinted');
      showBubble('Давай начнём сначала!');
      say('start-over');
    }
  }

  function giveIdea() {
    const left = MIX_COLORS.filter((c) => !store.isDiscovered(c.id));
    sfx.hint();
    if (!left.length) {
      showBubble('Все цвета собраны!');
      say('all-found');
      return;
    }
    const c = left[Math.floor(Math.random() * left.length)];
    const used = PIGMENTS.filter((p) => c.recipe[p] > 0);
    showBubble(
      `А если смешать ${used.map((p) => `<i class="dot" style="--c:${PAINT_BY_ID[p].hex}"></i>`).join(' + ')} ?`,
      4000,
    );
    used.forEach((p) => jarBtns.get(p)!.classList.add('is-hinted'));
    say(`idea-${c.id}`);
  }

  // ---------- win ----------
  function win(isNew: boolean) {
    won = true;
    clearHints();
    const stars = starsFor(actions, totalDrops(level!.recipe), hinted);
    store.setStars(level!.id, stars);
    blob.setBaseMood('happy');
    blob.react('happy', 99999);
    blob.jump();
    sfx.win();
    say(`win-${level!.id}`);
    const usedColors = PIGMENTS.filter((p) => drops[p] > 0).map((p) => PAINT_BY_ID[p].hex);
    burst([level!.hex, ...usedColors, '#FFD21F']);
    setTimeout(() => showWin(stars, isNew), 900);
  }

  function showWin(stars: number, isNew: boolean) {
    const idx = levelIndex!;
    const last = idx === MIX_COLORS.length - 1;
    const recipe = PIGMENTS.filter((p) => level!.recipe[p] > 0)
      .map(
        (p) =>
          `<span class="eq-chip">${dropSVG(PAINT_BY_ID[p].hex)}<b>${level!.recipe[p]}</b></span>`,
      )
      .join('<span class="eq-op">+</span>');
    const modal = html(`
      <div class="modal-backdrop">
        <div class="modal win-card" role="dialog" aria-label="Задание выполнено">
          <div class="win-rays" style="--c:${level!.hex}"></div>
          <div class="win-blob"></div>
          <h2 class="win-title">Ура!</h2>
          <p class="win-sub">Получился <b style="--c:${level!.hex}">${level!.name.toLowerCase()}</b></p>
          <div class="win-stars">${[0, 1, 2].map((i) => starSVG(i < stars)).join('')}</div>
          <div class="equation win-recipe">${recipe}<span class="eq-op">=</span><span class="eq-result">${swatchSVG(level!.hex, 5)}</span></div>
          ${isNew ? `<div class="win-new">${icon.sparkle} Новый цвет в коллекции!</div>` : ''}
          <div class="win-actions">
            <button class="btn btn-ghost" data-again>${icon.replay}<span>Ещё раз</span></button>
            <button class="btn btn-primary" data-next><span>${last ? 'Все задания' : 'Дальше'}</span>${icon.next}</button>
          </div>
        </div>
      </div>`);
    const mini = new PaintBlob({ face: true, color: level!.hex, seed: 9, look: false });
    $(modal, '.win-blob').append(mini.svg);
    mini.setBaseMood('happy');
    root.append(modal);
    setTimeout(() => mini.jump(), 350);
    modal.querySelectorAll('.star').forEach((s, i) => {
      if (s.classList.contains('is-on')) setTimeout(() => sfx.star(i), 450 + i * 260);
    });
    cleanup.push(() => mini.destroy());
    $(modal, '[data-again]').addEventListener('click', () => go({ name: 'level', index: idx }));
    $(modal, '[data-next]').addEventListener('click', () =>
      go(last ? { name: 'levels' } : { name: 'level', index: idx + 1 }),
    );
  }

  // ---------- effects ----------
  function flyDrop(jar: HTMLElement, hex: string, done: () => void) {
    const jr = jar.querySelector('.jar-art')!.getBoundingClientRect();
    const start = { x: jr.left + jr.width / 2, y: jr.top + jr.height * 0.12 };
    const end = blob.mouthPoint();
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
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const anim = d.animate(frames, { duration: reduced ? 200 : 560, easing: 'cubic-bezier(.3,.1,.6,1)' });
    anim.onfinish = () => {
      d.remove();
      done();
    };
  }

  function splash(hex: string) {
    const m = blob.mouthPoint();
    for (let i = 0; i < 9; i++) {
      const s = html(`<i class="splash-dot" style="--c:${hex}"></i>`);
      document.body.append(s);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      const v = 50 + Math.random() * 70;
      const size = 8 + Math.random() * 10;
      s.style.width = s.style.height = `${size}px`;
      s.animate(
        [
          { transform: `translate(${m.x}px, ${m.y}px) translate(-50%,-50%) scale(1)`, opacity: 1 },
          {
            transform: `translate(${m.x + Math.cos(a) * v}px, ${m.y + Math.sin(a) * v + 30}px) translate(-50%,-50%) scale(.2)`,
            opacity: 0,
          },
        ],
        { duration: 520, easing: 'cubic-bezier(.2,.7,.4,1)' },
      ).onfinish = () => s.remove();
    }
  }

  // ---------- keyboard ----------
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
    const idx = Number(e.key) - 1;
    if (idx >= 0 && idx < PAINTS.length) addDrop(PAINTS[idx].id, jarBtns.get(PAINTS[idx].id)!);
    else if (e.key === 'Backspace' || (e.key === 'z' && (e.metaKey || e.ctrlKey))) undo();
    else if (e.key === 'Delete') pour();
  };

  const cleanup: (() => void)[] = [];

  return {
    el: root,
    mount() {
      renderReadout(drops);
      window.addEventListener('keydown', onKey);
      if (level) {
        preload([`win-${level.id}`, ...PAINTS.map((p) => `add-${p.id}`)]);
        setTimeout(() => say(`task-${level.id}`), 350);
      } else {
        setTimeout(() => {
          showBubble('Покорми меня краской!');
          say('studio-intro');
        }, 400);
      }
    },
    destroy() {
      blob.destroy();
      cleanup.forEach((f) => f());
      clearTimeout(speakTimer);
      clearTimeout(bubbleTimer);
      window.removeEventListener('keydown', onKey);
      document.querySelectorAll('.flying-drop, .splash-dot').forEach((n) => n.remove());
    },
  };
}
