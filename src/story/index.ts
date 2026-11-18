// The story around the tasks. Solving all of them brings Кляксын, who
// steals the stars and the found colors; solving them again brings the
// hedgehog, whose glade lost its colors too. Painting the glade back earns
// the gold paint. Screens call `storyCheck` when they open.

import { MIX_COLORS } from '../data';
import { store } from '../storage';
import { go } from '../ui';
import { scene, sceneOpen } from './cutscene';

export const allSolved = () => MIX_COLORS.every((c) => store.stars(c.id) > 0);

export interface StoryHooks {
  /** shows the colors being drained from the screen, before they are reset */
  drain?(): Promise<void>;
  /** redraws the screen after the theft */
  refresh(): void;
}

/** Plays the next story scene if its moment has come; true if it did. */
export function storyCheck(hooks: StoryHooks): boolean {
  if (sceneOpen() || !allSolved()) return false;
  if (store.story === 'none') {
    void theft(hooks);
    return true;
  }
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
  store.steal();
  hooks.refresh();
  await scene({
    actor: 'klyaksa',
    text: 'Ой! Злой Кляксын забрал все звёзды и цвета! Давай вернём их — пройди задания ещё раз!',
    voice: 'villain-after',
    button: 'Вернём!',
  });
}

async function askForHelp() {
  await scene({
    actor: 'hedgehog',
    text: 'Помоги мне, пожалуйста! Злой Кляксын забрал с моей полянки все цвета. Если поможешь, я тебя награжу!',
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
    text: 'Ура! Моя полянка снова цветная! Спасибо тебе! Вот твоя награда — волшебная золотая краска!',
    voice: 'hedgehog-thanks',
    button: 'Ура!',
  });
}
