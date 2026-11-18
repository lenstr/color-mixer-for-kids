const KEY = 'klyaksa-v1';

/** free: paint anything; hint: dots show the real colors; task: only the real color sticks */
export type PaintMode = 'free' | 'hint' | 'task';

/**
 * The story: after all tasks are solved the villain Кляксын steals the
 * colors (`stolen`) and the hedgehog asks for help (`asked`); the world stays
 * gray until his glade is painted, which brings the colors back and earns the
 * gold paint (`saved`). Nothing is erased: the stars and found colors only
 * look gray meanwhile.
 */
export type StoryStage = 'none' | 'stolen' | 'asked' | 'saved';

/** A coloring page in progress: region id -> paint hex, and the regions painted their real color. */
export interface Artwork {
  fills: Record<string, string>;
  ok: string[];
}

interface Saved {
  stars: Record<string, number>; // level color id -> 1..3
  discovered: string[]; // collectible color ids
  sound: boolean;
  unlockAll: boolean; // parent setting: every level is open
  paintMode: PaintMode;
  art: Record<string, Artwork>; // picture id -> artwork
  catchBest: number; // best score in «Поймай цвет»
  story: StoryStage;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch {
    /* private mode or corrupted — start fresh */
  }
  return fresh();
}

function fresh(): Saved {
  return { stars: {}, discovered: [], sound: true, unlockAll: false, paintMode: 'hint', art: {}, catchBest: 0, story: 'none' };
}

const data = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export const store = {
  get sound() {
    return data.sound;
  },
  set sound(v: boolean) {
    data.sound = v;
    save();
  },
  get unlockAll() {
    return data.unlockAll;
  },
  set unlockAll(v: boolean) {
    data.unlockAll = v;
    save();
  },
  stars(id: string): number {
    return data.stars[id] ?? 0;
  },
  /** Keeps the best result. */
  setStars(id: string, n: number) {
    data.stars[id] = Math.max(n, data.stars[id] ?? 0);
    save();
  },
  totalStars(): number {
    return Object.values(data.stars).reduce((a, b) => a + b, 0);
  },
  isDiscovered(id: string): boolean {
    return data.discovered.includes(id);
  },
  /** Returns true if the color is new. */
  discover(id: string): boolean {
    if (data.discovered.includes(id)) return false;
    data.discovered.push(id);
    save();
    return true;
  },
  discoveredCount(): number {
    return data.discovered.length;
  },
  get paintMode() {
    return data.paintMode;
  },
  set paintMode(m: PaintMode) {
    data.paintMode = m;
    save();
  },
  artwork(id: string): Artwork {
    const a = data.art[id];
    return { fills: { ...a?.fills }, ok: [...(a?.ok ?? [])] };
  },
  saveArtwork(id: string, a: Artwork) {
    if (Object.keys(a.fills).length) data.art[id] = a;
    else delete data.art[id];
    save();
  },
  get catchBest() {
    return data.catchBest;
  },
  /** Keeps the best score. */
  set catchBest(n: number) {
    data.catchBest = Math.max(n, data.catchBest);
    save();
  },
  get story() {
    return data.story;
  },
  set story(s: StoryStage) {
    data.story = s;
    save();
    paintWorld();
  },
  /** The hedgehog's gift: the gold paint. */
  get gold() {
    return data.story === 'saved';
  },
  /** The hedgehog has asked for help: his quests are open. */
  get questsOpen() {
    return data.story === 'asked' || data.story === 'saved';
  },
  /** Кляксын took the colors: the tasks and the collection look gray. */
  get colorless() {
    return data.story === 'stolen' || data.story === 'asked';
  },
  /** Forgets stars, found colors, pictures, the record and the story; settings stay. */
  reset() {
    data.stars = {};
    data.discovered = [];
    data.art = {};
    data.catchBest = 0;
    data.story = 'none';
    save();
    paintWorld();
  },
};

/** The root class `is-colorless` grays the world while Кляксын holds the colors. */
function paintWorld() {
  document.documentElement.classList.toggle('is-colorless', store.colorless);
}
paintWorld();
