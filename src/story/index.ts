// The story around the tasks. Solving all of them brings Кляксын, who
// drains the colors from the world, and right after him the hedgehog, whose
// glade lost its colors too. Painting the glade brings the colors back and
// earns the gold paint. Screens call `storyCheck` when they open.

import { MIX_COLORS } from '../data';
import { store } from '../storage';
import { go } from '../ui';
import { scene, sceneOpen } from './cutscene';

export const allSolved = () => MIX_COLORS.every((c) => store.stars(c.id) > 0);

export interface StoryHooks {
  /** shows the colors being drained from the screen */
  drain?(): Promise<void>;
  /** redraws the screen, gray after the theft */
  refresh(): void;
}

let playing = false;

/** Plays the next story scene if its moment has come; true if it did. */
export function storyCheck(hooks: StoryHooks): boolean {
  // the theft redraws the screen it runs on, which checks again
  if (playing || sceneOpen()) return false;
  if (store.story === 'none' && allSolved()) {
    playing = true;
    void theft(hooks)
      .then(askForHelp)
      .finally(() => (playing = false));
    return true;
  }
  // the theft was seen, but the hedgehog was not (the game was closed between)
  if (store.story === 'stolen') {
    void askForHelp();
    return true;
  }
  return false;
}

async function theft(hooks: StoryHooks) {
  await scene({
    actor: 'villain',
    text: 'Ха-ха-ха! Я злой Кляксын! Я оставлю мир без красок! Ха-ха-ха-ха!',
    voice: 'villain-laugh',
    button: 'Ой-ой!',
  });
  await hooks.drain?.();
  store.story = 'stolen';
  hooks.refresh();
  await scene({
    actor: 'klyaksa',
    text: 'Ой! Злой Кляксын забрал все цвета! Кто же нам поможет?',
    voice: 'villain-after',
    button: 'Ой-ой-ой…',
  });
}

async function askForHelp() {
  await scene({
    actor: 'hedgehog',
    text: 'Помоги мне, пожалуйста! Злой Кляксын забрал все цвета, и с моей полянки тоже. Раскрась её, и цвета вернутся! А я тебя награжу.',
    voice: 'hedgehog-help',
    button: 'Помогу!',
  });
  store.story = 'asked';
  go({ name: 'home' });
}

/** The glade is painted: the hedgehog thanks and gives the gold paint. */
export async function gladeSaved() {
  if (store.story === 'saved') return;
  store.story = 'saved';
  await scene({
    actor: 'hedgehog',
    text: 'Ура! Моя полянка снова цветная, и все цвета вернулись! Спасибо тебе! Вот твоя награда — волшебная золотая краска!',
    voice: 'hedgehog-thanks',
    button: 'Ура!',
  });
}
