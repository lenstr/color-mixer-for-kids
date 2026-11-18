// Picks a coloring page and the way to paint it. The tiles show the kid's
// own work, so this screen doubles as the gallery.

import { PICTURES, type Picture } from '../coloring/pictures';
import { pictureSVG } from '../coloring/render';
import { icon } from '../icons';
import { sfx } from '../audio';
import { say } from '../speech';
import { type PaintMode, store } from '../storage';
import { type Screen, go, html, topBar } from '../ui';

export const MODES: { id: PaintMode; name: string; note: string; icon: string }[] = [
  { id: 'free', name: 'Свободно', note: 'любые цвета', icon: icon.palette },
  { id: 'hint', name: 'С подсказкой', note: 'точки подскажут', icon: icon.bulb },
  { id: 'task', name: 'Задание', note: 'вспомни настоящий цвет', icon: icon.target },
];

/** How far the kid got: 'perfect' when every part has its real color. */
export function progress(pic: Picture) {
  const art = store.artwork(pic.id);
  const painted = pic.regions.filter((r) => art.fills[r.id]).length;
  const right = pic.regions.filter((r) => art.ok.includes(r.id)).length;
  const state =
    right === pic.regions.length ? 'perfect' : painted === pic.regions.length ? 'done' : painted ? 'started' : 'new';
  return { art, state };
}

export function coloringScreen(): Screen {
  const root = html(`<section class="screen coloring"></section>`);
  root.append(topBar('Раскраска', { name: 'home' }));

  const modes = html(`
    <div class="mode-switch" role="radiogroup" aria-label="Как раскрашивать">
      ${MODES.map(
        (m) => `
        <button class="mode-btn" role="radio" data-mode="${m.id}">
          <span class="mode-icon">${m.icon}</span>
          <span class="mode-text"><b>${m.name}</b><small>${m.note}</small></span>
        </button>`,
      ).join('')}
    </div>`);
  const paintModes = () =>
    modes.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
      const on = b.dataset.mode === store.paintMode;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    });
  paintModes();
  modes.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      store.paintMode = b.dataset.mode as PaintMode;
      sfx.tap();
      paintModes();
      say(`mode-${store.paintMode}`);
    }),
  );

  const grid = html(`<div class="paint-grid-list"></div>`);
  PICTURES.forEach((pic, i) => {
    const { art, state } = progress(pic);
    const badge =
      state === 'perfect'
        ? `<span class="paint-badge is-perfect" aria-label="Все цвета точные">${icon.star}</span>`
        : state === 'done'
          ? `<span class="paint-badge" aria-label="Готово">${icon.check}</span>`
          : '';
    const tile = html<HTMLButtonElement>(`
      <button class="paint-tile is-${state}" style="--i:${i}" aria-label="${pic.name}">
        <span class="paint-thumb">${pictureSVG(pic, art.fills)}</span>
        <span class="paint-name">${pic.name}</span>
        ${badge}
      </button>`);
    tile.addEventListener('click', () => {
      sfx.tap();
      go({ name: 'paint', id: pic.id });
    });
    grid.append(tile);
  });

  const scroll = html(`<div class="scroll-area"><div class="coloring-wrap"></div></div>`);
  scroll.firstElementChild!.append(modes, grid);
  root.append(scroll);

  return {
    el: root,
    mount() {
      say('coloring');
    },
  };
}
