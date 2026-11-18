// Settings for grown-ups, behind a long press so kids don't wipe their progress by accident.

import { icon } from './icons';
import { sfx } from './audio';
import { store } from './storage';
import { $, html } from './ui';

const HOLD_MS = 1500;

let closeOpen: (() => void) | null = null;

/** Closes the panel without reporting changes, e.g. when the screen under it goes away. */
export function closeParentPanel() {
  closeOpen?.();
}

/** A button that opens the parent panel only after it is held down. */
export function parentButton(onChange: () => void) {
  const btn = html<HTMLButtonElement>(`
    <button class="icon-btn parent-btn" aria-label="Для взрослых: подержи кнопку">
      ${icon.gear}<span class="parent-tip">Подержи</span>
    </button>`);
  let timer = 0;
  const cancel = () => {
    clearTimeout(timer);
    btn.classList.remove('is-holding');
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.classList.add('is-holding');
    btn.classList.remove('is-tipped');
    timer = window.setTimeout(() => {
      cancel();
      sfx.tap();
      openParentPanel(onChange);
    }, HOLD_MS);
  });
  btn.addEventListener('pointerup', () => {
    if (btn.classList.contains('is-holding')) btn.classList.add('is-tipped');
    cancel();
  });
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  // keyboard users are grown-ups already
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openParentPanel(onChange);
    }
  });
  return btn;
}

function openParentPanel(onChange: () => void) {
  let changed = false;
  const modal = html(`
    <div class="modal-backdrop">
      <div class="modal parent-card" role="dialog" aria-modal="true" aria-labelledby="parent-title">
        <h2 class="parent-title" id="parent-title">Для взрослых</h2>
        <label class="parent-row">
          <input type="checkbox" data-unlock ${store.unlockAll ? 'checked' : ''}>
          <span><b>Открыть все задания</b><small>Обычно открыты три задания после последнего пройденного</small></span>
        </label>
        <div class="parent-row parent-reset">
          <span><b>Сбросить прогресс</b><small>Звёзды и найденные цвета сотрутся</small></span>
          <button class="btn btn-ghost" data-reset>Сбросить</button>
          <button class="btn btn-danger" data-confirm hidden>Да, стереть</button>
        </div>
        <button class="btn btn-primary" data-close>Готово</button>
      </div>
    </div>`);

  const dismiss = () => {
    closeOpen = null;
    removeEventListener('keydown', onKey);
    modal.remove();
  };
  const close = () => {
    dismiss();
    if (changed) onChange();
  };
  closeOpen = dismiss;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  $<HTMLInputElement>(modal, '[data-unlock]').addEventListener('change', (e) => {
    store.unlockAll = (e.target as HTMLInputElement).checked;
    changed = true;
  });
  const resetBtn = $<HTMLButtonElement>(modal, '[data-reset]');
  const confirmBtn = $<HTMLButtonElement>(modal, '[data-confirm]');
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
  });
  $(modal, '[data-close]').addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  addEventListener('keydown', onKey);
  document.body.append(modal);
  $<HTMLElement>(modal, '[data-close]').focus();
}
