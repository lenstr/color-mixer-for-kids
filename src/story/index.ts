// The story around the tasks. Solving all of them brings Кляксын, who
// drains the colors from the world, and right after him the hedgehog, whose
// glade lost its colors too. Painting the glade brings the colors back and
// earns the gold paint. Screens call `storyCheck` when they open.

import { MIX_COLORS } from '../data';
import { store } from '../storage';
import { go } from '../ui';
import { scene } from './cutscene';

export const allSolved = () => MIX_COLORS.every((c) => store.stars(c.id) > 0);

export interface StoryHooks {
  /** shows the colors being drained from the screen */
  drain?(): Promise<void>;
}

/** The scenes in play; the screen they end on checks again and must wait. */
let running: Promise<void> | null = null;

/** Plays the next story scenes if their moment has come; true if it did. */
export function storyCheck(hooks: StoryHooks = {}): boolean {
  if (running) return false;
  let play: () => Promise<void>;
  if (store.story === 'none' && allSolved()) play = () => theft(hooks).then(askForHelp);
  // the theft was seen, but the hedgehog was not (the game was closed between)
  else if (store.story === 'stolen') play = askForHelp;
  else return false;
  running = play().finally(() => (running = null));
  return true;
}

async function theft(hooks: StoryHooks) {
  await scene({
    actor: 'villain',
    voice: 'villain-laugh',
    button: 'Ой-ой!',
  });
  await hooks.drain?.();
  // the root class keeps the drained screen gray
  store.story = 'stolen';
  await scene({
    actor: 'klyaksa',
    voice: 'villain-after',
    button: 'Ой-ой-ой…',
  });
}

async function askForHelp() {
  await scene({
    actor: 'hedgehog',
    voice: 'hedgehog-help',
    button: 'Помогу!',
  });
  store.story = 'asked';
  go({ name: 'home' });
}

/** The glade is painted: the hedgehog thanks and gives the gold paint. Call it once. */
export async function gladeSaved() {
  store.story = 'saved';
  await scene({
    actor: 'hedgehog',
    voice: 'hedgehog-thanks',
    button: 'Ура!',
  });
}
