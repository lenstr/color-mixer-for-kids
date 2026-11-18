// Every spoken line in the game. `scripts/generate-voice.ts` turns these into
// mp3 files in public/voice/<id>.mp3; at runtime the game plays the file and
// falls back to the browser's speech synthesis if it is missing.

import { ALL_COLORS, MIX_COLORS, PAINTS } from './data';
import { PICTURES } from './coloring/pictures';

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
  coloring: 'Выбери картинку и раскрась её!',
  'mode-free': 'Раскрашивай как хочешь!',
  'mode-hint': 'Точки подскажут, какой цвет нужен!',
  'mode-task': 'Вспомни, какого цвета всё на самом деле!',
  'need-paint': 'Сначала набери краску! Нажми на баночку.',
  'wrong-color': 'Ой, сюда нужен другой цвет!',
  'picture-done': 'Готово! Какая красивая картинка!',
  'picture-perfect': 'Ура! Все цвета как настоящие!',
  'catch-intro': 'Лови капельки в ведро и смешай нужный цвет! А грязь не лови!',
  'catch-extra': 'Ой, лишняя капля!',
  'catch-mud': 'Фу, грязь!',
  'catch-mouse': 'А вот и мышка-уборщица!',
  'catch-over': 'Ведро упало! Давай ещё раз!',
  'catch-record': 'Ура! Новый рекорд!',
  // the story; `VOICES` gives the villain and the hedgehog their own voices
  'villain-laugh': 'Ха-ха-ха! Я злой Кляксын! Я оставлю мир без красок! Ха-ха-ха-ха!',
  'villain-after': 'Ой! Злой Кляксын забрал все цвета! Кто же нам поможет?',
  'hedgehog-help': 'Помоги мне, пожалуйста! Злой Кляксын забрал все цвета, и с моей полянки тоже. Раскрась её, и цвета вернутся! А я тебя награжу.',
  quests: 'Ёжик ждёт твоей помощи!',
  'quests-done': 'Ты помог ёжику! Он очень рад.',
  'glade-intro': 'Раскрась мою полянку! Вспомни, какого цвета трава, небо и цветы.',
  'hedgehog-thanks': 'Ура! Моя полянка снова цветная, и все цвета вернулись! Спасибо тебе! Вот твоя награда — волшебная золотая краска!',
  'colors-gone': 'Кляксын забрал цвета! Помоги ёжику, и они вернутся.',
  'gold-gift': 'Золотая краска теперь в мастерской и в раскраске!',
};

/** Phrases spoken by someone other than Клякса: phrase id -> character. */
export const VOICES: Record<string, 'villain' | 'hedgehog'> = {
  'villain-laugh': 'villain',
  'hedgehog-help': 'hedgehog',
  'glade-intro': 'hedgehog',
  'hedgehog-thanks': 'hedgehog',
};

for (const p of PICTURES) {
  PHRASES[`paint-${p.id}`] = `Раскрась ${p.acc}!`;
}

// hints never ask for gold: no task or picture needs it
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
