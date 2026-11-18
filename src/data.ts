import { type Drops, GOLD, type Pigment, PIGMENTS, distance, emptyDrops, mixHex, totalDrops } from './color';

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

/** The hedgehog's gift; its jar joins the studio and the coloring shelf once earned. */
export const GOLD_PAINT: PaintInfo = { id: 'gold', name: 'Золотая', genitive: 'золотой', hex: GOLD };

/** The jars on a free shelf: the gold one joins them once the hedgehog gave it. */
export const shelfPaints = (gold: boolean) => (gold ? [...PAINTS, GOLD_PAINT] : PAINTS);

export const PAINT_BY_ID = Object.fromEntries([...PAINTS, GOLD_PAINT].map((p) => [p.id, p])) as Record<Pigment, PaintInfo>;

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
  named('carrot', 'Морковный', { red: 2, yellow: 1 }),
  named('lime', 'Салатовый', { yellow: 2, blue: 1 }),
  named('raspberry', 'Малиновый', { red: 2, blue: 1 }),
  named('turquoise', 'Бирюзовый', { yellow: 1, blue: 2 }),
  named('peach', 'Персиковый', { red: 1, yellow: 1, white: 1 }),
  named('lilac', 'Сиреневый', { red: 1, blue: 1, white: 1 }),
  named('mint', 'Мятный', { yellow: 1, blue: 1, white: 2 }),
  named('burgundy', 'Бордовый', { red: 2, black: 1 }),
  named('navy', 'Тёмно-синий', { blue: 2, black: 1 }),
  named('darkgreen', 'Тёмно-зелёный', { yellow: 1, blue: 1, black: 1 }),
];

export const GOLD_COLOR = named('gold', 'Золотой', { gold: 1 }, true);

export const ALL_COLORS = [...BASIC_COLORS, GOLD_COLOR, ...MIX_COLORS];

export const COLOR_BY_ID = Object.fromEntries(ALL_COLORS.map((c) => [c.id, c])) as Record<string, NamedColor>;

export const MAX_DROPS = 24;

/** ΔE below which a mix counts as "the same color". */
export const MATCH = 2.5;
/** ΔE below which a mix is "almost" a named color. */
export const NEAR = 9;

/** The named color closest to a mix, or null for an empty mix. */
export function nearest(d: Drops): { color: NamedColor; dist: number } | null {
  if (!totalDrops(d)) return null;
  let best = ALL_COLORS[0];
  let bestD = Infinity;
  for (const c of ALL_COLORS) {
    const dd = distance(d, c.recipe);
    if (dd < bestD) {
      bestD = dd;
      best = c;
    }
  }
  return { color: best, dist: bestD };
}

/** What a non-empty mix is called: its name, "Почти …" or "Новый оттенок". */
export function colorLabel(d: Drops): string {
  const n = nearest(d)!;
  if (n.dist < MATCH) return n.color.name;
  return n.dist < NEAR ? `Почти ${n.color.name.toLowerCase()}` : 'Новый оттенок';
}

export type Suggestion = { kind: 'add'; pigment: Pigment } | { kind: 'undo' } | { kind: 'pour' } | { kind: 'done' };

/**
 * What should the kid do next to reach `target`? Finds the smallest multiple
 * of the recipe that contains the current drops and points at the paint that
 * is missing the most.
 */
export function suggest(cur: Drops, history: Pigment[], target: Drops): Suggestion {
  if (distance(cur, target) < MATCH) return { kind: 'done' };
  const stray = PIGMENTS.filter((p) => cur[p] > 0 && target[p] === 0);
  if (stray.length) {
    const last = history.at(-1);
    const onlyLast = stray.length === 1 && last === stray[0] && cur[stray[0]] === 1;
    return onlyLast ? { kind: 'undo' } : { kind: 'pour' };
  }
  let k = 1;
  for (const p of PIGMENTS) if (target[p]) k = Math.max(k, Math.ceil(cur[p] / target[p]));
  if (k * totalDrops(target) > MAX_DROPS) return { kind: 'pour' };
  let best: Pigment = 'red';
  let need = -1;
  for (const p of PIGMENTS) {
    const missing = k * target[p] - cur[p];
    if (missing > need) {
      need = missing;
      best = p;
    }
  }
  return { kind: 'add', pigment: best };
}
