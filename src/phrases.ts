// Every spoken line in the game. `scripts/generate-voice.ts` turns these into
// mp3 files in public/voice/<id>.mp3; at runtime the game plays the file and
// falls back to the browser's speech synthesis if it is missing.

import { ALL_COLORS, MIX_COLORS, PAINTS } from './data';

const lc = (s: string) => s.toLowerCase();

/** "красную и синюю", "красную, жёлтую и белую" */
function paintList(ids: string[]) {
  const acc: Record<string, string> = {
    red: 'красную',
    yellow: 'жёлтую',
    blue: 'синюю',
    white: 'белую',
    black: 'чёрную',
  };
  const words = ids.map((i) => acc[i]);
  return words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} и ${words.at(-1)}`;
}

export const PHRASES: Record<string, string> = {
  hello: 'Привет! Я Клякса. Давай смешивать краски!',
  hungry: 'Покорми меня краской!',
  full: 'Ой, я уже полная! Давай выльем краску.',
  'too-much': 'Многовато! Убери последнюю каплю.',
  'start-over': 'Давай начнём сначала. Вылей краску!',
  'new-shade': 'Ого! Какой интересный оттенок!',
  'studio-intro': 'Нажимай на баночки и смотри, что получится!',
  levels: 'Выбери задание!',
  collection: 'Это твоя коллекция цветов!',
  'all-found': 'Ура! Все цвета найдены! Ты настоящий художник!',
  pour: 'Буль-буль-буль!',
};

for (const p of PAINTS) {
  PHRASES[`add-${p.id}`] = `Добавь ${p.genitive} краски!`;
}

for (const c of ALL_COLORS) {
  PHRASES[`name-${c.id}`] = `${c.name}!`;
}

for (const c of MIX_COLORS) {
  const used = (Object.keys(c.recipe) as (keyof typeof c.recipe)[]).filter((k) => c.recipe[k] > 0);
  PHRASES[`task-${c.id}`] = `Сделай ${lc(c.name)} цвет!`;
  PHRASES[`win-${c.id}`] = `Ура! Получился ${lc(c.name)}!`;
  PHRASES[`found-${c.id}`] = `Новый цвет! ${c.name}!`;
  PHRASES[`idea-${c.id}`] = `А что получится, если смешать ${paintList(used)}?`;
}
