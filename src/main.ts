import '@fontsource/unbounded/cyrillic-600.css';
import '@fontsource/unbounded/cyrillic-800.css';
import '@fontsource/unbounded/latin-800.css';
import '@fontsource/nunito/cyrillic-700.css';
import '@fontsource/nunito/cyrillic-800.css';
import '@fontsource/nunito/latin-800.css';
import './styles.css';

import { type Route, type Screen, setNavigator } from './ui';
import { homeScreen } from './screens/home';
import { levelsScreen, isUnlocked } from './screens/levels';
import { collectionScreen } from './screens/collection';
import { mixerScreen } from './screens/mixer';
import { coloringScreen } from './screens/coloring';
import { paintScreen } from './screens/paint';
import { catchScreen } from './screens/catch';
import { gladeScreen, questsScreen } from './screens/quests';
import { store } from './storage';
import { PICTURE_BY_ID } from './coloring/pictures';
import { MIX_COLORS } from './data';
import { hush } from './speech';
import './install';
import './update';

const app = document.getElementById('app')!;
let current: Screen | null = null;

function build(r: Route): Screen {
  switch (r.name) {
    case 'home':
      return homeScreen();
    case 'levels':
      return levelsScreen();
    case 'collection':
      return collectionScreen();
    case 'studio':
      return mixerScreen(null);
    case 'level':
      return isUnlocked(r.index) ? mixerScreen(r.index) : levelsScreen();
    case 'coloring':
      return coloringScreen();
    case 'paint':
      return paintScreen(PICTURE_BY_ID[r.id]);
    case 'catch':
      return catchScreen();
    // the hedgehog's quests open once he has asked for help
    case 'quests':
      return store.story === 'asked' || store.story === 'saved' ? questsScreen() : homeScreen();
    case 'glade':
      return store.story === 'asked' || store.story === 'saved' ? gladeScreen() : homeScreen();
  }
}

function toHash(r: Route) {
  if (r.name === 'level') return `#level-${r.index + 1}`;
  if (r.name === 'paint') return `#paint-${r.id}`;
  return r.name === 'home' ? '#' : `#${r.name}`;
}

function fromHash(): Route {
  const h = location.hash.slice(1);
  const m = h.match(/^level-(\d+)$/);
  if (m) {
    const index = Number(m[1]) - 1;
    return MIX_COLORS[index] ? { name: 'level', index } : { name: 'levels' };
  }
  const p = h.match(/^paint-(\w+)$/);
  if (p) return PICTURE_BY_ID[p[1]] ? { name: 'paint', id: p[1] } : { name: 'coloring' };
  if (h === 'levels' || h === 'collection' || h === 'studio' || h === 'coloring' || h === 'catch' || h === 'quests' || h === 'glade')
    return { name: h };
  return { name: 'home' };
}

function show(r: Route) {
  hush();
  document.querySelectorAll('.toast, body > .modal-backdrop').forEach((t) => t.remove());
  const prev = current;
  const next = build(r);
  current = next;
  if (prev) {
    prev.destroy?.();
    const old = prev.el;
    old.classList.add('is-leaving');
    old.addEventListener('animationend', () => old.remove(), { once: true });
    setTimeout(() => old.remove(), 500);
  }
  app.append(next.el);
  next.mount?.();
}

setNavigator((r) => {
  const hash = toHash(r);
  if (location.hash !== hash && !(hash === '#' && !location.hash)) history.pushState(null, '', hash || '#');
  show(r);
});

addEventListener('popstate', () => show(fromHash()));
show(fromHash());

// Block pinch/double-tap zoom on tablets — little fingers tap fast.
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
