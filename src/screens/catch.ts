// «Поймай цвет»: the screen around the catching game. The game draws the sky,
// the drops, the bucket and the shelf; this screen adds the task card, the
// living Клякса under the bucket and the dialogs, and turns the game's events
// into sounds, voice lines and the saved record.

import { type CatchEvent, type Hud, LEVELS, LIVES, type Player, catchGame } from '../catch/game';
import { PaintBlob, swatchSVG } from '../blob';
import { dropSVG } from '../jar';
import { reduced } from '../effects';
import { icon } from '../icons';
import { sfx } from '../audio';
import { say, speaking } from '../speech';
import { store } from '../storage';
import { $, type Screen, go, html, topBar } from '../ui';

const KEYS: Record<string, 'left' | 'right'> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };

/** A short buzz on phones that can; it goes quiet with the sound. */
const buzz = (pattern: number | number[]) => {
  if (store.sound) navigator.vibrate?.(pattern);
};

const heartSVG = (on: boolean) =>
  `<svg viewBox="0 0 24 24" class="${on ? '' : 'is-lost'}" aria-hidden="true"><path d="M12 20.5s-8.5-5.2-8.5-11a4.6 4.6 0 0 1 8.5-2.5 4.6 4.6 0 0 1 8.5 2.5c0 5.8-8.5 11-8.5 11z" fill="${on ? '#E8273F' : 'none'}" stroke="#2B2340" stroke-width="2.4" stroke-linejoin="round"/></svg>`;

const mudSVG = `<svg viewBox="-20 -20 40 40" aria-hidden="true"><path d="M0 -15 C8 -17 10 -9 15 -6 C19 0 14 6 13 11 C9 17 2 13 -3 15 C-10 17 -12 9 -15 5 C-18 -2 -13 -6 -10 -11 C-7 -16 -4 -14 0 -15Z" fill="#6B4A2B" stroke="#2B2340" stroke-width="3.5" stroke-linejoin="round"/><path d="M-9 -4l5 5M-4 -4l-5 5M4 -4l5 5M9 -4l-5 5" stroke="#FFFDF7" stroke-width="2.4" stroke-linecap="round"/></svg>`;

export function catchScreen(): Screen {
  const root = html(`<section class="screen catch"></section>`);
  root.append(
    topBar('Поймай цвет', { name: 'home' }, `<button class="icon-btn" data-pause aria-label="Пауза">${icon.pause}</button>`),
  );
  const card = html(`
    <div class="card catch-card" aria-live="polite">
      <div class="catch-target"></div>
      <div class="catch-goal">
        <div class="card-kicker catch-kicker"></div>
        <div class="catch-name"></div>
        <div class="catch-recipe" aria-label="Рецепт"></div>
      </div>
      <div class="catch-score">
        <b data-score>0</b>
        <div class="catch-lives" aria-label="Сердечки"></div>
      </div>
    </div>`);
  const stage = html(`
    <div class="catch-stage">
      <canvas class="catch-canvas" aria-label="Игра: лови капли краски в ведро"></canvas>
      <div class="catch-blob"></div>
      <button class="tool catch-pour" data-pour aria-label="Вылить ведро" disabled>${icon.pour}<span>Вылить</span></button>
    </div>`);
  root.append(card, stage);
  const canvas = $<HTMLCanvasElement>(stage, 'canvas');
  const pourBtn = $<HTMLButtonElement>(stage, '[data-pour]');
  const blobBox = $(stage, '.catch-blob');

  // Клякса is the real blob; it starts empty and takes each finished color
  const blob = new PaintBlob({ face: true, color: null, seed: 4, look: false });
  blobBox.append(blob.el);

  // ---------- task card ----------
  let shownTarget = '';
  let shownScore = 0;
  function renderHud(h: Hud) {
    if (shownTarget !== h.target.id) {
      shownTarget = h.target.id;
      $(card, '.catch-target').innerHTML = swatchSVG(h.target.hex, h.level + 3, { face: true });
      $(card, '.catch-name').textContent = h.target.name;
      $(card, '.catch-kicker').textContent = `Цвет ${h.level}`;
    }
    // the recipe in drops, mixed ones too: purple + white for lilac
    const recipeEl = $(card, '.catch-recipe');
    recipeEl.innerHTML = h.recipe
      .map(
        (part) =>
          `<span class="catch-part">${Array.from(
            { length: part.need },
            (_, i) => `<span class="catch-pip ${i < part.got ? 'is-on' : ''}">${dropSVG(part.hex)}</span>`,
          ).join('')}</span>`,
      )
      .join('<b class="catch-plus">+</b>');
    recipeEl.setAttribute('aria-label', h.recipe.map((part) => `${part.name} ${part.got} из ${part.need}`).join(', '));
    const scoreEl = $(card, '[data-score]');
    scoreEl.textContent = String(h.score);
    if (h.score !== shownScore) {
      shownScore = h.score;
      scoreEl.classList.remove('is-bump');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('is-bump');
    }
    $(card, '.catch-lives').innerHTML = Array.from({ length: LIVES }, (_, i) => heartSVG(i < h.lives)).join('');
    pourBtn.disabled = !h.recipe.some((part) => part.got > 0);
  }

  // ---------- dialogs ----------
  let dialog: HTMLElement | null = null;
  function openDialog(label: string, body: string, actions: [string, string, () => void][]) {
    closeDialog();
    dialog = html(`
      <div class="modal-backdrop">
        <div class="modal catch-modal" role="dialog" aria-label="${label}">
          ${body}
          <div class="win-actions">
            ${actions.map(([cls, inner], i) => `<button class="btn ${cls}" data-act="${i}">${inner}</button>`).join('')}
          </div>
        </div>
      </div>`);
    actions.forEach(([, , run], i) =>
      $(dialog!, `[data-act="${i}"]`).addEventListener('click', () => {
        sfx.tap();
        run();
      }),
    );
    root.append(dialog);
    dialog.querySelector<HTMLButtonElement>('.btn-primary')?.focus();
  }
  function closeDialog() {
    dialog?.remove();
    dialog = null;
  }

  const play = () => {
    closeDialog();
    blob.pause(false);
    blob.setColor(null);
    game.start();
  };
  const resume = () => {
    closeDialog();
    blob.pause(false);
    game.paused = false;
  };
  const goHome = () => go({ name: 'home' });

  function showStart() {
    const best = store.catchBest;
    openDialog(
      'Поймай цвет',
      `<h2 class="win-title catch-title">Поймай цвет</h2>
       <ul class="catch-rules">
         <li>${dropSVG('#FF8A1C')}<span>Лови капли, из которых<br>смешается нужный цвет</span></li>
         <li>${mudSVG}<span>Лишняя капля и грязь<br>портят ведро</span></li>
         <li>${icon.pour}<span>Ведро можно вылить</span></li>
       </ul>
       ${best ? `<p class="catch-best">Рекорд: <b>${best}</b></p>` : ''}`,
      [['btn-primary', `${icon.play}<span>Играть</span>`, play]],
    );
  }

  function showPause() {
    if (dialog || (game.phase !== 'play' && game.phase !== 'won')) return;
    game.paused = true;
    blob.pause();
    openDialog('Пауза', `<h2 class="win-title catch-title">Пауза</h2>`, [
      ['btn-ghost', `${icon.replay}<span>Заново</span>`, play],
      ['btn-primary', `${icon.play}<span>Играть</span>`, resume],
    ]);
  }

  function showOver(score: number, record: boolean, reached: Hud['target']) {
    openDialog(
      'Игра окончена',
      `<h2 class="win-title catch-title">Ведро упало!</h2>
       <p class="win-sub">Очки: <b style="--c:#FFD21F">${score}</b></p>
       ${record ? `<div class="win-new">${icon.sparkle} Новый рекорд!</div>` : `<p class="catch-best">Рекорд: <b>${store.catchBest}</b></p>`}
       <p class="catch-best">Дошли до цвета <b style="--c:${reached.hex}">${reached.name.toLowerCase()}</b></p>`,
      [
        ['btn-ghost', `${icon.home}<span>Домой</span>`, goHome],
        ['btn-primary', `${icon.replay}<span>Ещё раз</span>`, play],
      ],
    );
  }

  // ---------- game ----------
  let reached = LEVELS[0].target;
  let overTimer = 0;

  function on(e: CatchEvent) {
    switch (e.type) {
      case 'hud':
        reached = e.hud.target;
        renderHud(e.hud);
        break;
      case 'level':
        if (e.first) say(`task-${e.target.id}`);
        break;
      case 'catch':
        sfx.plop(e.pigment);
        sfx.catchDrop(e.combo);
        buzz(12);
        blob.wiggle(-2.5); // the splash weighs the bucket down onto the head
        blob.react('yum', 450);
        break;
      case 'spoil':
        sfx.spoil();
        buzz(60);
        blob.shake();
        if (!e.over) say(e.why === 'mud' ? 'catch-mud' : 'catch-extra');
        break;
      case 'pour':
        sfx.pour();
        blob.react('open', 600);
        break;
      case 'win':
        sfx.win();
        buzz([20, 60, 20, 60, 40]);
        blob.eat(e.target.hex, e.target.hex);
        blob.react('happy', 1500);
        say(`win-${e.target.id}`, `task-${e.next.id}`);
        break;
      case 'over': {
        const record = e.score > store.catchBest;
        store.catchBest = e.score;
        sfx.gameOver();
        say(record ? 'catch-record' : 'catch-over');
        // the dialog waits until the bucket has fallen and settled
        overTimer = window.setTimeout(() => showOver(e.score, record, reached), 1900);
        break;
      }
      case 'land':
        blob.wiggle(-4.5);
        buzz(15);
        sfx.plop('yellow');
        break;
      case 'thud':
        sfx.thud();
        buzz(90);
        blob.react('oops', 1400);
        break;
      case 'mouse':
        sfx.squeak();
        if (!speaking()) say('catch-mouse');
        break;
    }
  }

  // Клякса stands under the bucket: its body is `width` wide, and the 300×250
  // blob box puts the floor 218 units from its top
  let boxW = 0;
  function frame(p: Player) {
    const w = (p.width * 300) / 208;
    if (Math.abs(w - boxW) > 0.5) {
      boxW = w;
      blobBox.style.width = `${w}px`;
    }
    const u = w / 300;
    blobBox.style.transform = `translate(${p.x - w / 2}px, ${p.groundY - 218 * u + p.hop}px)`;
    // the pour tool stands past the right end of the shelf when there is room
    const room = stage.clientWidth - p.shelfRight - pourBtn.offsetWidth - 16;
    const right = `${room > 0 ? room : 0}px`;
    if (pourBtn.style.right !== right) pourBtn.style.right = right;
    if (p.look) {
      const r = stage.getBoundingClientRect();
      blob.lookAt(r.left + p.look.x, r.top + p.look.y);
    }
  }

  const game = catchGame(canvas, { on, frame, calm: reduced() });

  const ro = new ResizeObserver(([entry]) => game.resize(entry.contentRect.width, entry.contentRect.height));
  ro.observe(stage);

  // ---------- input ----------
  canvas.addEventListener('pointerdown', (e) => {
    game.pointer(e.clientX);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons) game.pointer(e.clientX);
  });
  const lift = () => game.pointer(null);
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);

  pourBtn.addEventListener('click', () => game.pour());
  $(root, '[data-pause]').addEventListener('click', () => {
    sfx.tap();
    if (dialog && game.paused) resume();
    else showPause();
  });

  const onKey = (e: KeyboardEvent) => {
    const dir = KEYS[e.code];
    if (dir) {
      e.preventDefault();
      game.key(dir, e.type === 'keydown');
      return;
    }
    if (e.type !== 'keydown' || e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (dialog && game.paused) resume();
      else showPause();
    } else if (dialog) return;
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') game.pour();
    else if (e.code === 'Space' && !(e.target as HTMLElement).closest('button')) {
      e.preventDefault();
      showPause();
    }
  };
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);
  const onHide = () => {
    if (document.hidden) showPause();
  };
  document.addEventListener('visibilitychange', onHide);

  return {
    el: root,
    mount() {
      renderHud(game.snapshot());
      showStart();
      say('catch-intro');
    },
    destroy() {
      clearTimeout(overTimer);
      game.destroy();
      blob.destroy();
      ro.disconnect();
      removeEventListener('keydown', onKey);
      removeEventListener('keyup', onKey);
      document.removeEventListener('visibilitychange', onHide);
    },
  };
}
