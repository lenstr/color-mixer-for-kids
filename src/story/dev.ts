// Dev server only: shortcuts in the parents' panel to jump into the story,
// so it can be checked on a phone without solving all the tasks. The
// production build drops this module (see parents.ts).

import { COLOR_BY_ID, MIX_COLORS } from '../data';
import { store } from '../storage';
import { go, html } from '../ui';
import { GLADE } from './glade';

export function devStoryRow(close: () => void) {
  const row = html(`
    <div class="parent-row parent-dev">
      <span><b>Проверка истории</b><small>Только на dev-сервере</small></span>
      <button class="btn btn-ghost" data-villain>Кляксын</button>
      <button class="btn btn-ghost" data-glade>Полянка без солнца</button>
    </div>`);
  row.querySelector('[data-villain]')!.addEventListener('click', () => {
    // all tasks solved and the story not started: the villain comes on the tasks screen
    for (const c of MIX_COLORS) store.setStars(c.id, 3);
    store.story = 'none';
    close();
    go({ name: 'levels' });
  });
  row.querySelector('[data-glade]')!.addEventListener('click', () => {
    // the hedgehog has asked and his glade misses only the sun: paint it yellow
    const fills: Record<string, string> = {};
    const ok: string[] = [];
    for (const r of GLADE.regions)
      if (r.id !== 'sun') {
        fills[r.id] = COLOR_BY_ID[r.target].hex;
        ok.push(r.id);
      }
    store.saveArtwork(GLADE.id, { fills, ok });
    store.story = 'asked';
    close();
    go({ name: 'glade' });
  });
  return row;
}
