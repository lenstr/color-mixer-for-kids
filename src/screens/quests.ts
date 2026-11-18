// The story's quests: the hedgehog asks to paint his glade back, and gives
// the gold paint for it. The list appears once he has asked.

import { GOLD_PAINT } from '../data';
import { jarSVG } from '../jar';
import { pictureSVG } from '../coloring/render';
import { icon } from '../icons';
import { sfx } from '../audio';
import { say } from '../speech';
import { store } from '../storage';
import { burst } from '../confetti';
import { $, type Screen, go, html, topBar } from '../ui';
import { hedgehogSVG } from '../story/characters';
import { GLADE } from '../story/glade';
import { gladeSaved } from '../story';
import { paintScreen } from './paint';

export function questsScreen(): Screen {
  const done = store.story === 'saved';
  const root = html(`<section class="screen quests"></section>`);
  root.append(topBar('Задания', { name: 'home' }));
  const art = store.artwork(GLADE.id);
  const body = html(`
    <div class="scroll-area">
      <div class="quests-wrap">
        <button class="card quest-card ${done ? 'is-done' : ''}" data-glade>
          <span class="quest-hero">${hedgehogSVG()}</span>
          <span class="quest-text">
            <small class="card-kicker">${done ? 'Выполнено' : 'Новое задание'}</small>
            <b>Помочь ёжику</b>
            <span>${done ? 'Полянка снова цветная, а у тебя золотая краска' : 'Верни цвета его полянке'}</span>
          </span>
          <span class="quest-thumb">${pictureSVG(GLADE, art.fills)}</span>
          <span class="quest-state">${done ? icon.check : '!'}</span>
        </button>
      </div>
    </div>`);
  root.append(body);
  $(body, '[data-glade]').addEventListener('click', () => {
    sfx.tap();
    go({ name: 'glade' });
  });

  return {
    el: root,
    mount() {
      say(done ? 'quests-done' : 'quests');
    },
  };
}

/** The glade as a coloring page: only the real colors stick, and no hints. */
export function gladeScreen(): Screen {
  return paintScreen(GLADE, {
    mode: 'task',
    back: { name: 'quests' },
    intro: 'glade-intro',
    done() {
      if (store.story === 'saved') return;
      void gladeSaved().then(showGift);
    },
  });
}

function showGift() {
  const modal = html(`
    <div class="modal-backdrop">
      <div class="modal catch-modal gift-card" role="dialog" aria-label="Награда">
        <div class="gift-jar">${jarSVG(GOLD_PAINT)}</div>
        <h2 class="win-title catch-title">Золотая краска!</h2>
        <p class="catch-best">Теперь она в мастерской и в раскраске</p>
        <div class="win-actions">
          <button class="btn btn-ghost" data-quests><span>Задания</span></button>
          <button class="btn btn-primary" data-studio>${icon.palette}<span>В мастерскую</span></button>
        </div>
      </div>
    </div>`);
  document.body.append(modal);
  sfx.discover();
  say('gold-gift');
  const box = $(modal, '.gift-jar').getBoundingClientRect();
  burst([GOLD_PAINT.hex, '#FFD21F', '#FFFDF7'], { x: box.left + box.width / 2, y: box.top + box.height / 2, count: 90 });
  const close = (to: 'quests' | 'studio') => {
    sfx.tap();
    modal.remove();
    go({ name: to });
  };
  $(modal, '[data-quests]').addEventListener('click', () => close('quests'));
  $(modal, '[data-studio]').addEventListener('click', () => close('studio'));
  $<HTMLButtonElement>(modal, '[data-studio]').focus();
}
