import { MIX_COLORS } from '../data';
import { swatchSVG } from '../blob';
import { icon, starSVG } from '../icons';
import { sfx } from '../audio';
import { say } from '../speech';
import { store } from '../storage';
import { type Screen, go, html, topBar } from '../ui';
import { storyCheck } from '../story';

/** How many unsolved levels past the furthest solved one stay open, so a kid stuck on one can try another. */
const OPEN_AHEAD = 3;

export function isUnlocked(i: number) {
  if (store.unlockAll || store.stars(MIX_COLORS[i].id) > 0) return true;
  let furthest = -1;
  MIX_COLORS.forEach((c, k) => {
    if (store.stars(c.id) > 0) furthest = k;
  });
  return i <= furthest + OPEN_AHEAD;
}

export function levelsScreen(): Screen {
  const root = html(`<section class="screen levels"></section>`);
  const total = store.totalStars();
  root.append(
    topBar('Задания', { name: 'home' }, `<span class="star-total">${starSVG(true)}<b>${total}</b></span>`),
  );

  const grid = html(`<div class="level-grid"></div>`);
  const next = MIX_COLORS.findIndex((c) => !store.stars(c.id));
  MIX_COLORS.forEach((c, i) => {
    const open = isUnlocked(i);
    const stars = store.stars(c.id);
    const current = i === next;
    const tile = html<HTMLButtonElement>(`
      <button class="level-tile ${open ? '' : 'is-locked'} ${current ? 'is-current' : ''} ${stars ? 'is-done' : ''}"
        style="--c:${c.hex}; --i:${i}" ${open ? '' : 'disabled'}
        aria-label="${open ? `Задание ${i + 1}: ${c.name}` : `Задание ${i + 1} закрыто`}">
        <span class="level-num">${i + 1}</span>
        <span class="level-swatch">${swatchSVG(open ? c.hex : null, i + 11, { face: current })}</span>
        ${open ? '' : `<span class="level-lock">${icon.lock}</span>`}
        <span class="level-name">${open ? c.name : '???'}</span>
        <span class="level-stars">${[0, 1, 2].map((k) => starSVG(k < stars)).join('')}</span>
      </button>`);
    if (open)
      tile.addEventListener('click', () => {
        sfx.tap();
        go({ name: 'level', index: i });
      });
    grid.append(tile);
  });
  root.append(html(`<div class="scroll-area"></div>`));
  root.lastElementChild!.append(grid);

  return {
    el: root,
    mount() {
      const story = storyCheck({
        // Кляксын drains the colors out of the solved tasks
        async drain() {
          sfx.drain();
          grid.classList.add('is-drained');
          await new Promise((r) => setTimeout(r, 1700));
        },
        refresh: () => go({ name: 'levels' }),
      });
      if (!story) say('levels');
      root.querySelector('.is-current')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
  };
}
