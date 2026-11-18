import { type Drops, PIGMENTS, distance, mixHex, totalDrops } from '../color';
import { MATCH, MIX_COLORS, NEAR, PAINTS, PAINT_BY_ID, colorLabel, nearest, shelfPaints, suggest } from '../data';
import { PaintBlob } from '../blob';
import { swatchSVG } from '../blob';
import { paintBrush } from '../brush';
import { dropSVG } from '../jar';
import { clearEffects } from '../effects';
import { icon, starSVG } from '../icons';
import { sfx } from '../audio';
import { say, preload } from '../speech';
import { store } from '../storage';
import { burst, warmup } from '../confetti';
import { $, type Screen, go, html, plural, restartClass, speechBubble, topBar } from '../ui';


/** Sunburst behind the win blob, as a ready-made image the GPU just spins. */
function raysImage(hex: string) {
  let wedges = '';
  for (let i = 0; i < 18; i++) {
    const a0 = (i * 20 * Math.PI) / 180;
    const a1 = a0 + (10 * Math.PI) / 180;
    const p = (a: number) => `${(Math.cos(a) * 100).toFixed(2)} ${(Math.sin(a) * 100).toFixed(2)}`;
    wedges += `M0 0L${p(a0)}A100 100 0 0 1 ${p(a1)}Z`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='-100 -100 200 200'><defs><radialGradient id='f'><stop offset='.4' stop-color='#fff'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></radialGradient><mask id='m'><circle r='100' fill='url(#f)'/></mask></defs><path mask='url(#m)' d='${wedges}' fill='${hex}' fill-opacity='.45'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function starsFor(actions: number, minimal: number, hinted: boolean) {
  let s = actions <= minimal ? 3 : actions <= minimal * 2 + 1 ? 2 : 1;
  if (hinted) s = Math.min(s, 2);
  return s;
}

export function mixerScreen(levelIndex: number | null): Screen {
  const level = levelIndex === null ? null : MIX_COLORS[levelIndex];
  const isLevel = !!level;

  let actions = 0;
  let hinted = false;
  let won = false;
  let lastSpoken = '';
  let speakTimer = 0;

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
    </div>`);
  root.append(grid);

  const stageBlob = $(grid, '.stage-blob');
  const bubble = $(grid, '.bubble');
  const nameEl = $(grid, '.readout-name');
  const eqEl = $(grid, '.equation');
  const side = $(grid, '.side');

  const blob = new PaintBlob({ face: true, color: null, seed: 3 });
  stageBlob.prepend(blob.el);
  blob.setBaseMood('hungry');

  const speech = speechBubble(bubble);
  const showBubble = speech.show;

  // ---------- jars ----------
  const brush = paintBrush({
    // tasks never need gold, so it stays in the studio
    paints: isLevel ? PAINTS : shelfPaints(store.gold),
    blob,
    bubble: showBubble,
    enabled: () => !won,
    onAdd: () => actions++,
    onLanded(mix) {
      renderReadout(mix);
      afterMix(mix);
    },
    onChange() {
      lastSpoken = '';
      renderReadout(brush.drops);
    },
  });
  grid.append(brush.el);

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
      nameEl.textContent = colorLabel(d);
      nameEl.style.setProperty('--c', hex);
      const parts = PIGMENTS.filter((p) => d[p] > 0).map(
        (p) => `<span class="eq-chip" title="${d[p]} ${plural(d[p], 'капля', 'капли', 'капель')}">
          ${dropSVG(PAINT_BY_ID[p].hex)}<b>${d[p]}</b></span>`,
      );
      eqEl.innerHTML =
        parts.join('<span class="eq-op">+</span>') +
        `<span class="eq-op">=</span><span class="eq-result">${swatchSVG(hex, 5)}</span>`;
    }
    restartClass(nameEl, 'pop');

    if (level && meterFill && meterLabel) {
      const dist = total ? distance(d, level.recipe) : Infinity;
      const pct = dist < MATCH ? 100 : Math.max(0, Math.round(100 - dist * 2.4));
      meterFill.style.width = `${pct}%`;
      meterLabel.textContent = pct === 100 ? 'Получилось!' : `Похоже на ${pct}%`;
      meterFill.closest('.meter')!.setAttribute('aria-valuenow', String(pct));
      meterFill.closest('.meter')!.classList.toggle('is-close', pct >= 75);
    }

    blob.setBaseMood(total ? 'smile' : 'hungry');
  }

  // ---------- actions ----------
  function afterMix(d: Drops) {
    if (won) return;
    const found = brush.discover(d);

    if (level && distance(d, level.recipe) < MATCH && brush.inFlight === 0) {
      win(!!found);
      return;
    }
    if (found) {
      brush.cheer(found);
      const r = blob.el.getBoundingClientRect();
      burst([found.hex, '#FFD21F', '#FFFDF7'], { x: r.left + r.width / 2, y: r.top + r.height * 0.4, count: 40 });
      paintCollection();
      lastSpoken = found.id;
      return;
    }
    // Name the color out loud once the kid pauses.
    clearTimeout(speakTimer);
    speakTimer = window.setTimeout(() => {
      if (brush.inFlight || won) return;
      const drops = brush.drops;
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

  function giveHint() {
    if (!level || won) return;
    hinted = true;
    brush.clearHints();
    const s = suggest(brush.drops, brush.history, level.recipe);
    sfx.hint();
    const line = brush.pointAt(s);
    if (!line) return;
    if (s.kind === 'add') {
      const paint = PAINT_BY_ID[s.pigment];
      showBubble(`Добавь <b style="--c:${paint.hex}">${paint.genitive}</b>!`);
    } else showBubble(s.kind === 'undo' ? 'Многовато! Убери последнюю каплю' : 'Давай начнём сначала!');
    say(line);
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
    used.forEach((p) => brush.jars.get(p)!.classList.add('is-hinted'));
    say(`idea-${c.id}`);
  }

  // ---------- win ----------
  function win(isNew: boolean) {
    won = true;
    brush.clearHints();
    const stars = starsFor(actions, totalDrops(level!.recipe), hinted);
    store.setStars(level!.id, stars);
    blob.setBaseMood('happy');
    blob.react('happy', 99999);
    blob.jump();
    sfx.win();
    say(`win-${level!.id}`);
    const usedColors = PIGMENTS.filter((p) => brush.drops[p] > 0).map((p) => PAINT_BY_ID[p].hex);
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
          <div class="win-rays"></div>
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
    $(modal, '.win-rays').style.setProperty('--rays', raysImage(level!.hex));
    // the scene behind the dialog freezes, so only the dialog is redrawn
    root.classList.add('is-paused');
    blob.pause();
    const mini = new PaintBlob({ face: true, color: level!.hex, seed: 9, look: false });
    $(modal, '.win-blob').append(mini.el);
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

  const cleanup: (() => void)[] = [];

  return {
    el: root,
    mount() {
      renderReadout(brush.drops);
      warmup();
      window.addEventListener('keydown', brush.onKey);
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
      speech.dispose();
      window.removeEventListener('keydown', brush.onKey);
      clearEffects();
    },
  };
}
