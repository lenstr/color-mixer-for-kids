import { type Pigment, PIGMENTS } from '../color';
import { BASIC_COLORS, MIX_COLORS, PAINT_BY_ID } from '../data';
import { swatchSVG } from '../blob';
import { dropSVG } from '../jar';
import { sfx } from '../audio';
import { say } from '../speech';
import { store } from '../storage';
import { type Screen, html, topBar } from '../ui';

function recipeHTML(recipe: Record<Pigment, number>) {
  return PIGMENTS.filter((p) => recipe[p] > 0)
    .map((p) => {
      const n = recipe[p];
      return `<span class="mini-recipe">${Array.from({ length: n }, () => dropSVG(PAINT_BY_ID[p].hex)).join('')}</span>`;
    })
    .join('<b>+</b>');
}

export function collectionScreen(): Screen {
  const found = store.discoveredCount();
  const root = html(`<section class="screen collection"></section>`);
  root.append(topBar('Коллекция', { name: 'home' }, `<span class="star-total is-count"><b>${found}</b> из ${MIX_COLORS.length}</span>`));

  const body = html(`
    <div class="scroll-area">
      <div class="collection-wrap">
        <h2 class="section-title">Основные краски</h2>
        <div class="basics">
          ${BASIC_COLORS.map(
            (c, i) => `<button class="basic" style="--c:${c.hex}; --i:${i}" data-say="name-${c.id}">
              ${swatchSVG(c.hex, i + 30)}<span>${c.name}</span></button>`,
          ).join('')}
        </div>
        <h2 class="section-title">Смешанные цвета <small>нажми, чтобы услышать</small></h2>
        <div class="sticker-grid">
          ${MIX_COLORS.map((c, i) => {
            const on = store.isDiscovered(c.id);
            return `<button class="sticker ${on ? 'is-on' : ''}" style="--c:${c.hex}; --i:${i}; --tilt:${((i * 37) % 7) - 3}deg"
                ${on ? `data-say="name-${c.id}"` : 'disabled'} aria-label="${on ? c.name : 'Ещё не найден'}">
              <span class="sticker-swatch">${swatchSVG(on ? c.hex : null, i + 50)}${on ? '' : '<b class="sticker-q">?</b>'}</span>
              <span class="sticker-name">${on ? c.name : 'Секрет'}</span>
              <span class="sticker-recipe">${on ? recipeHTML(c.recipe) : ''}</span>
            </button>`;
          }).join('')}
        </div>
      </div>
    </div>`);
  root.append(body);

  body.querySelectorAll<HTMLButtonElement>('[data-say]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.tap();
      b.classList.remove('is-bounce');
      void b.offsetWidth;
      b.classList.add('is-bounce');
      say(b.dataset.say!);
    }),
  );

  return {
    el: root,
    mount() {
      say(found === MIX_COLORS.length ? 'all-found' : 'collection');
    },
  };
}
