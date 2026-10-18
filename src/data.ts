import { type Drops, type Pigment, emptyDrops, mixHex } from './color';

export interface PaintInfo {
  id: Pigment;
  name: string; // "красная"
  genitive: string; // "красной" — for hints: "добавь красной"
  hex: string;
}

export const PAINTS: PaintInfo[] = [
  { id: 'red', name: 'Красная', genitive: 'красной', hex: '#E8273F' },
  { id: 'yellow', name: 'Жёлтая', genitive: 'жёлтой', hex: '#FFD21F' },
  { id: 'blue', name: 'Синяя', genitive: 'синей', hex: '#1F62D8' },
  { id: 'white', name: 'Белая', genitive: 'белой', hex: '#FFFDF7' },
  { id: 'black', name: 'Чёрная', genitive: 'чёрной', hex: '#2A2630' },
];

export const PAINT_BY_ID = Object.fromEntries(PAINTS.map((p) => [p.id, p])) as Record<Pigment, PaintInfo>;

export interface NamedColor {
  id: string;
  name: string;
  recipe: Drops;
  hex: string;
  /** true for colors you start with (the paint jars) — not collectible */
  basic?: boolean;
}

const r = (parts: Partial<Drops>): Drops => ({ ...emptyDrops(), ...parts });

function named(id: string, name: string, recipe: Partial<Drops>, basic = false): NamedColor {
  const drops = r(recipe);
  return { id, name, recipe: drops, hex: mixHex(drops)!, basic };
}

export const BASIC_COLORS: NamedColor[] = [
  named('red', 'Красный', { red: 1 }, true),
  named('yellow', 'Жёлтый', { yellow: 1 }, true),
  named('blue', 'Синий', { blue: 1 }, true),
  named('white', 'Белый', { white: 1 }, true),
  named('black', 'Чёрный', { black: 1 }, true),
];

/** Collectible mixes, in level order (easiest first). */
export const MIX_COLORS: NamedColor[] = [
  named('orange', 'Оранжевый', { red: 1, yellow: 1 }),
  named('green', 'Зелёный', { yellow: 1, blue: 1 }),
  named('purple', 'Фиолетовый', { red: 1, blue: 1 }),
  named('pink', 'Розовый', { red: 1, white: 1 }),
  named('skyblue', 'Голубой', { blue: 1, white: 1 }),
  named('gray', 'Серый', { white: 1, black: 1 }),
  named('brown', 'Коричневый', { red: 1, yellow: 1, blue: 1 }),
  named('honey', 'Медовый', { red: 1, yellow: 2 }),
  named('lime', 'Салатовый', { yellow: 2, blue: 1 }),
  named('raspberry', 'Малиновый', { red: 2, blue: 1 }),
  named('turquoise', 'Бирюзовый', { yellow: 1, blue: 2 }),
  named('peach', 'Персиковый', { red: 1, yellow: 1, white: 1 }),
  named('lilac', 'Сиреневый', { red: 1, blue: 1, white: 1 }),
  named('mint', 'Мятный', { yellow: 1, blue: 1, white: 2 }),
  named('burgundy', 'Бордовый', { red: 2, black: 1 }),
  named('navy', 'Тёмно-синий', { blue: 2, black: 1 }),
  named('darkgreen', 'Тёмно-зелёный', { yellow: 1, blue: 1, black: 1 }),
  named('carrot', 'Морковный', { red: 2, yellow: 1 }),
];

export const ALL_COLORS = [...BASIC_COLORS, ...MIX_COLORS];

export const MAX_DROPS = 24;
