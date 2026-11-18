const KEY = 'klyaksa-v1';

/** free: paint anything; hint: dots show the real colors; task: only the real color sticks */
export type PaintMode = 'free' | 'hint' | 'task';

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
  return { stars: {}, discovered: [], sound: true, unlockAll: false, paintMode: 'hint', art: {} };
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
  /** Forgets stars, found colors and pictures; settings stay. */
  reset() {
    data.stars = {};
    data.discovered = [];
    data.art = {};
    save();
  },
};
