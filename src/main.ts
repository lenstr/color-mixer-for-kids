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
  }
}

function toHash(r: Route) {
  return r.name === 'level' ? `#level-${r.index + 1}` : r.name === 'home' ? '#' : `#${r.name}`;
}

function fromHash(): Route {
  const h = location.hash.slice(1);
  const m = h.match(/^level-(\d+)$/);
  if (m) return { name: 'level', index: Number(m[1]) - 1 };
  if (h === 'levels' || h === 'collection' || h === 'studio') return { name: h };
  return { name: 'home' };
}

function show(r: Route) {
  hush();
  document.querySelectorAll('.toast').forEach((t) => t.remove());
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
