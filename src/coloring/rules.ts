// How a coloring page is played and when it is done; shared by the picker
// and the painting screen.

import { icon } from '../icons';
import type { Artwork, PaintMode } from '../storage';
import type { Picture } from './pictures';

export const MODES: { id: PaintMode; name: string; note: string; icon: string }[] = [
  { id: 'free', name: 'Свободно', note: 'любые цвета', icon: icon.palette },
  { id: 'hint', name: 'С подсказкой', note: 'точки подскажут', icon: icon.bulb },
  { id: 'task', name: 'Задание', note: 'вспомни настоящий цвет', icon: icon.target },
];

/** Every part is painted, in any color. */
export const isComplete = (pic: Picture, art: Artwork) => pic.regions.every((r) => art.fills[r.id]);

/** Every part has its real color. */
export const isPerfect = (pic: Picture, art: Artwork) => pic.regions.every((r) => art.ok.includes(r.id));

export function progress(pic: Picture, art: Artwork) {
  if (isPerfect(pic, art)) return 'perfect';
  if (isComplete(pic, art)) return 'done';
  return Object.keys(art.fills).length ? 'started' : 'new';
}
