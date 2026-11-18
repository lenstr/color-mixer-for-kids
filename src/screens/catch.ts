// «Поймай цвет»: the screen around the catching game. The game draws and
// plays by itself; this screen gives it a canvas, the buttons and keys, and
// turns its events into sounds, voice lines and the saved record.

import { type CatchEvent, catchGame } from '../catch/game';
import { reduced } from '../effects';
import { icon } from '../icons';
import { sfx } from '../audio';
import { say, speaking } from '../speech';
import { store } from '../storage';
import { $, type Screen, html, topBar } from '../ui';

const KEYS: Record<string, 'left' | 'right'> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };

export function catchScreen(): Screen {
  const root = html(`<section class="screen catch"></section>`);
  root.append(
    topBar('Поймай цвет', { name: 'home' }, `<button class="icon-btn" data-pause aria-label="Пауза">${icon.pause}</button>`),
  );
  const stage = html(`
    <div class="catch-stage">
      <canvas class="catch-canvas" aria-label="Игра: лови капли краски в ведро"></canvas>
      <button class="btn catch-pour" data-pour hidden>${icon.pour}<span>Вылить</span></button>
    </div>`);
  root.append(stage);
  const canvas = $<HTMLCanvasElement>(stage, 'canvas');
  const pourBtn = $<HTMLButtonElement>(stage, '[data-pour]');
  const pauseBtn = $<HTMLButtonElement>(root, '[data-pause]');

  function on(e: CatchEvent) {
    switch (e.type) {
      case 'level':
        pourBtn.hidden = false;
        if (e.first) say(`task-${e.target.id}`);
        break;
      case 'catch':
        sfx.catchDrop(e.combo);
        break;
      case 'spoil':
        sfx.spoil();
        if (!e.over) say(e.why === 'mud' ? 'catch-mud' : 'catch-extra');
        break;
      case 'pour':
        sfx.pour();
        break;
      case 'win':
        sfx.win();
        say(`win-${e.target.id}`, `task-${e.next.id}`);
        break;
      case 'over': {
        pourBtn.hidden = true;
        const record = e.score > store.catchBest;
        store.catchBest = e.score;
        sfx.gameOver();
        say(record ? 'catch-record' : 'catch-over');
        break;
      }
      case 'mouse':
        sfx.squeak();
        if (!speaking()) say('catch-mouse');
        break;
    }
  }

  const game = catchGame(canvas, { on, best: () => store.catchBest, calm: reduced() });

  const ro = new ResizeObserver(([entry]) => game.resize(entry.contentRect.width, entry.contentRect.height));
  ro.observe(stage);

  const wake = () => {
    const used = game.wake();
    if (used) sfx.tap();
    return used;
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (wake()) return;
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
  const togglePause = () => {
    if (game.paused) game.wake();
    else game.paused = true;
    sfx.tap();
  };
  pauseBtn.addEventListener('click', togglePause);

  const onKey = (e: KeyboardEvent) => {
    const dir = KEYS[e.code];
    if (dir) {
      e.preventDefault();
      game.key(dir, e.type === 'keydown');
      return;
    }
    if (e.type !== 'keydown' || e.repeat) return;
    // Space and Enter on a focused button press that button instead
    const onButton = (e.target as HTMLElement).closest('button');
    if (e.code === 'ArrowDown' || e.code === 'KeyS') game.pour();
    else if ((e.code === 'Space' || e.code === 'Enter') && !onButton) {
      e.preventDefault();
      if (!wake() && e.code === 'Space') togglePause();
    } else if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  };
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);
  const onHide = () => {
    if (document.hidden) game.paused = true;
  };
  document.addEventListener('visibilitychange', onHide);

  return {
    el: root,
    mount() {
      say('catch-intro');
    },
    destroy() {
      game.destroy();
      ro.disconnect();
      removeEventListener('keydown', onKey);
      removeEventListener('keyup', onKey);
      document.removeEventListener('visibilitychange', onHide);
    },
  };
}
