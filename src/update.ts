// "A new version is ready" banner. The service worker downloads updates in
// the background; the kid (or a parent) decides when to switch, so a game is
// never reloaded mid-task.

import { registerSW } from 'virtual:pwa-register';
import { html } from './ui';

const HOUR = 60 * 60 * 1000;

const updateSW = registerSW({
  onNeedRefresh() {
    if (document.querySelector('.update-banner')) return;
    const b = html(`
      <div class="update-banner" role="status">
        <span>Есть новая версия</span>
        <button class="btn btn-ghost" data-later>Позже</button>
        <button class="btn btn-primary" data-update>Обновить</button>
      </div>`);
    b.querySelector('[data-later]')!.addEventListener('click', () => b.remove());
    b.querySelector('[data-update]')!.addEventListener('click', () => {
      void updateSW(true);
      // On the very first visit the page isn't controlled yet, so there is
      // no hand-over event to wait for: the new version is already active.
      setTimeout(() => location.reload(), 1500);
    });
    document.body.append(b);
  },
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    // An installed app can stay open for days: check when it comes back
    // to the foreground and once an hour.
    const check = () => {
      if (navigator.onLine) void reg.update();
    };
    setInterval(check, HOUR);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check();
    });
  },
});
