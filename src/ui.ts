import { icon } from './icons';
import { store } from './storage';
import { hush } from './speech';
import { sfx } from './audio';
import { swatchSVG } from './blob';

export interface Screen {
  el: HTMLElement;
  /** called after the element is attached to the document */
  mount?(): void;
  destroy?(): void;
}

export type Route =
  | { name: 'home' }
  | { name: 'levels' }
  | { name: 'collection' }
  | { name: 'studio' }
  | { name: 'level'; index: number };

let navigate: (r: Route) => void = () => {};
export const setNavigator = (fn: (r: Route) => void) => (navigate = fn);
export const go = (r: Route) => navigate(r);

export function html<T extends HTMLElement = HTMLElement>(markup: string): T {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as T;
}

export const $ = <T extends Element = HTMLElement>(root: ParentNode, sel: string) =>
  root.querySelector(sel) as T;

/** Shared top bar: back button, title, sound toggle. */
export function topBar(title: string, back: Route | null, extra = '') {
  const bar = html(`
    <header class="topbar">
      ${back ? `<button class="icon-btn" data-back aria-label="Назад">${icon.back}</button>` : '<span></span>'}
      <h1 class="topbar-title">${title}</h1>
      <div class="topbar-right">
        ${extra}
        <button class="icon-btn" data-sound aria-label="Звук"></button>
      </div>
    </header>`);
  const soundBtn = $(bar, '[data-sound]');
  const paint = () => {
    soundBtn.innerHTML = store.sound ? icon.soundOn : icon.soundOff;
    soundBtn.classList.toggle('is-off', !store.sound);
  };
  paint();
  soundBtn.addEventListener('click', () => {
    store.sound = !store.sound;
    if (!store.sound) hush();
    else sfx.tap();
    paint();
  });
  if (back) {
    $(bar, '[data-back]').addEventListener('click', () => {
      sfx.tap();
      go(back);
    });
  }
  return bar;
}

let toastTimer = 0;

export function toast(title: string, subtitle: string, hex: string) {
  document.querySelector('.toast')?.remove();
  const t = html(`
    <div class="toast" role="status">
      <div class="toast-swatch">${swatchSVG(hex, 7, { face: true })}</div>
      <div class="toast-text"><small>${title}</small><strong>${subtitle}</strong></div>
      <div class="toast-sparkle">${icon.sparkle}</div>
    </div>`);
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    t.classList.add('is-leaving');
    setTimeout(() => t.remove(), 400);
  }, 2800);
}

/** "2 капли" / "5 капель" */
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
