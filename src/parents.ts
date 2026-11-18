// Settings for grown-ups, behind a sum that a 3–7 year old cannot solve, so a
// kid does not wipe their progress by accident. A plain tap works with every
// input; a long press was easy to miss and is fragile on touch screens.

import { icon } from './icons';
import { sfx } from './audio';
import { store } from './storage';
import { $, html } from './ui';

const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

/** The gear button; `onChange` runs after the panel closes if anything changed. */
export function parentButton(onChange: () => void) {
  const btn = html<HTMLButtonElement>(
    `<button class="icon-btn parent-btn" aria-label="Для взрослых">${icon.gear}</button>`,
  );
  btn.addEventListener('click', () => {
    sfx.tap();
    openParentPanel(btn, onChange);
  });
  return btn;
}

/** Opens over the screen that holds `btn`, so the panel goes away with that screen. */
function openParentPanel(btn: HTMLElement, onChange: () => void) {
  let changed = false;
  const modal = html(`
    <div class="modal-backdrop">
      <div class="modal parent-card" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="parent-title">
        <h2 class="parent-title" id="parent-title">Для взрослых</h2>
        <div class="parent-body"></div>
      </div>
    </div>`);
  const body = $(modal, '.parent-body');

  const close = () => {
    modal.remove();
    if (changed) onChange();
  };

  function showGate() {
    const a = rand(6, 9);
    const b = rand(6, 9);
    const answer = a + b;
    const options = new Set([answer]);
    while (options.size < 3) options.add(answer + rand(-3, 3));
    body.innerHTML = `
      <p class="parent-question">Сколько будет ${a} + ${b}?</p>
      <div class="parent-answers">
        ${[...options]
          .sort((x, y) => x - y)
          .map((n) => `<button class="btn btn-ghost" data-answer="${n}">${n}</button>`)
          .join('')}
      </div>
      <button class="btn btn-primary" data-close>Отмена</button>`;
    body.querySelectorAll<HTMLButtonElement>('[data-answer]').forEach((b) =>
      b.addEventListener('click', () => {
        if (Number(b.dataset.answer) === answer) showSettings();
        else showGate();
      }),
    );
    bindClose();
  }

  function showSettings() {
    body.innerHTML = `
      <label class="parent-row">
        <input type="checkbox" data-unlock ${store.unlockAll ? 'checked' : ''}>
        <span><b>Открыть все задания</b><small>Обычно открыты три задания после последнего пройденного</small></span>
      </label>
      <div class="parent-row parent-reset">
        <span><b>Сбросить прогресс</b><small>Звёзды, найденные цвета, раскраски, рекорд и история с ёжиком сотрутся</small></span>
        <button class="btn btn-ghost" data-reset>Сбросить</button>
        <button class="btn btn-danger" data-confirm hidden>Да, стереть</button>
      </div>
      <button class="btn btn-primary" data-close>Готово</button>`;
    $<HTMLInputElement>(body, '[data-unlock]').addEventListener('change', (e) => {
      store.unlockAll = (e.target as HTMLInputElement).checked;
      changed = true;
    });
    const resetBtn = $<HTMLButtonElement>(body, '[data-reset]');
    const confirmBtn = $<HTMLButtonElement>(body, '[data-confirm]');
    resetBtn.addEventListener('click', () => {
      resetBtn.hidden = true;
      confirmBtn.hidden = false;
      confirmBtn.focus();
    });
    confirmBtn.addEventListener('click', () => {
      store.reset();
      changed = true;
      confirmBtn.textContent = 'Стёрто';
      confirmBtn.disabled = true;
      // Escape is heard only inside the panel, and a disabled button drops focus
      $<HTMLElement>(body, '[data-close]').focus();
    });
    bindClose();
  }

  /** Each step redraws the body, so its close button is wired anew and takes focus. */
  function bindClose() {
    const done = $<HTMLButtonElement>(body, '[data-close]');
    done.addEventListener('click', close);
    done.focus();
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  btn.closest('.screen')!.append(modal);
  showGate();
}
