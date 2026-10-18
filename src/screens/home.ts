import { PaintBlob } from '../blob';
import { MIX_COLORS, PAINTS } from '../data';
import { dropSVG } from '../jar';
import { icon } from '../icons';
import { sfx } from '../audio';
import { say, speaking } from '../speech';
import { store } from '../storage';
import { canInstall, install, onInstallChange } from '../install';
import { $, type Screen, go, html } from '../ui';

const LOGO = 'Клякса';
const LOGO_COLORS = ['#E8273F', '#FF8A1C', '#FFD21F', '#2BAE4C', '#1F62D8', '#8A3FC4'];

// Little equations floating around the hero, teaching the three basic mixes.
const LESSONS: [string, string, string][] = [
  ['#E8273F', '#FFD21F', '#FF8A1C'],
  ['#FFD21F', '#1F62D8', '#2BAE4C'],
  ['#E8273F', '#1F62D8', '#8A3FC4'],
];

export function homeScreen(): Screen {
  const stars = store.totalStars();
  const found = store.discoveredCount();
  const root = html(`
    <section class="screen home">
      <div class="home-topright">
        <button class="install-btn" data-install hidden>${icon.install}<span>Установить</span></button>
        <button class="icon-btn" data-sound aria-label="Звук"></button>
      </div>
      <div class="home-hero">
        <h1 class="logo" aria-label="${LOGO}">
          ${[...LOGO].map((ch, i) => `<span style="--c:${LOGO_COLORS[i % LOGO_COLORS.length]}; --i:${i}">${ch}</span>`).join('')}
        </h1>
        <p class="tagline">весёлая мастерская цвета</p>
        <div class="home-stage">
          <div class="home-blob"></div>
          ${LESSONS.map(
            ([a, b, c], i) => `
            <div class="lesson lesson-${i}">
              <span class="lesson-drop">${dropSVG(a)}</span><b>+</b>
              <span class="lesson-drop">${dropSVG(b)}</span><b>=</b>
              <span class="lesson-drop is-result">${dropSVG(c)}</span>
            </div>`,
          ).join('')}
        </div>
      </div>
      <nav class="home-menu">
        <button class="menu-btn menu-play" data-go="levels">
          <span class="menu-icon">${icon.play}</span>
          <span class="menu-text"><b>Играть</b><small>${stars ? `${stars} ★ из ${MIX_COLORS.length * 3}` : `${MIX_COLORS.length} заданий`}</small></span>
        </button>
        <button class="menu-btn menu-studio" data-go="studio">
          <span class="menu-icon">${icon.palette}</span>
          <span class="menu-text"><b>Мастерская</b><small>смешивай что хочешь</small></span>
        </button>
        <button class="menu-btn menu-book" data-go="collection">
          <span class="menu-icon">${icon.book}</span>
          <span class="menu-text"><b>Коллекция</b><small>${found} из ${MIX_COLORS.length} цветов</small></span>
        </button>
      </nav>
      <div class="home-paints" aria-hidden="true">
        ${PAINTS.map((p, i) => `<i style="--c:${p.hex}; --i:${i}"></i>`).join('')}
      </div>
    </section>`);

  const blob = new PaintBlob({ face: true, color: LOGO_COLORS[0], seed: 1 });
  $(root, '.home-blob').append(blob.el);
  blob.el.addEventListener('pointerdown', () => {
    if (!blob.jump()) return;
    sfx.squeeze('yellow');
    if (!speaking()) say('hello');
  });

  // The mascot cycles through colors, showing off a swirl each time.
  let ci = 0;
  const cycle = window.setInterval(() => {
    ci = (ci + 1) % MIX_COLORS.length;
    const c = MIX_COLORS[ci];
    blob.eat(c.hex, c.hex);
  }, 2600);

  const soundBtn = $(root, '[data-sound]');
  const paintSound = () => {
    soundBtn.innerHTML = store.sound ? icon.soundOn : icon.soundOff;
    soundBtn.classList.toggle('is-off', !store.sound);
  };
  paintSound();
  soundBtn.addEventListener('click', () => {
    store.sound = !store.sound;
    paintSound();
  });

  const installBtn = $<HTMLButtonElement>(root, '[data-install]');
  const paintInstall = () => (installBtn.hidden = !canInstall());
  paintInstall();
  const offInstall = onInstallChange(paintInstall);
  installBtn.addEventListener('click', () => {
    sfx.tap();
    void install();
  });

  root.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.tap();
      go({ name: b.dataset.go as 'levels' | 'studio' | 'collection' });
    }),
  );

  return {
    el: root,
    destroy() {
      clearInterval(cycle);
      blob.destroy();
      offInstall();
    },
  };
}
