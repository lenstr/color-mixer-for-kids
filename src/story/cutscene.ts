// A story scene over the current screen: a character walks in, says its
// line in a speech bubble (and out loud), and walks off when the child taps
// the button.

import { PaintBlob } from '../blob';
import { sfx } from '../audio';
import { say, hush } from '../speech';
import { $, html } from '../ui';
import { hedgehogSVG, villainSVG } from './characters';

export type Actor = 'villain' | 'hedgehog' | 'klyaksa';

export interface SceneOptions {
  actor: Actor;
  text: string;
  /** phrase id in phrases.ts */
  voice: string;
  button: string;
}

let open = false;
/** A scene is on screen; story checks wait for it to end. */
export const sceneOpen = () => open;

export function scene(o: SceneOptions): Promise<void> {
  open = true;
  const root = html(`
    <div class="story-backdrop is-${o.actor}">
      <div class="story-scene" role="dialog" aria-label="${o.text}">
        <div class="story-bubble">${o.text}</div>
        <div class="story-actor"></div>
        <button class="btn btn-primary story-next">${o.button}</button>
      </div>
    </div>`);
  const actor = $(root, '.story-actor');
  let blob: PaintBlob | null = null;
  if (o.actor === 'klyaksa') {
    blob = new PaintBlob({ face: true, color: '#9B6BF2', seed: 7, look: false });
    blob.setBaseMood('oops');
    actor.append(blob.el);
  } else actor.innerHTML = o.actor === 'villain' ? villainSVG() : hedgehogSVG();
  document.body.append(root);

  if (o.actor === 'villain') sfx.villain();
  else sfx.hint();
  setTimeout(() => say(o.voice), 450);
  const btn = $<HTMLButtonElement>(root, '.story-next');
  setTimeout(() => btn.focus(), 600);

  return new Promise((resolve) => {
    btn.addEventListener(
      'click',
      () => {
        sfx.tap();
        hush();
        root.classList.add('is-leaving');
        setTimeout(() => {
          blob?.destroy();
          root.remove();
          open = false;
          resolve();
        }, 750);
      },
      { once: true },
    );
  });
}
