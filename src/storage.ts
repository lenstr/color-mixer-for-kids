const KEY = 'klyaksa-v1';

interface Saved {
  stars: Record<string, number>; // level color id -> 1..3
  discovered: string[]; // collectible color ids
  sound: boolean;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { stars: {}, discovered: [], sound: true, ...JSON.parse(raw) };
  } catch {
    /* private mode or corrupted — start fresh */
  }
  return { stars: {}, discovered: [], sound: true };
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
  reset() {
    data.stars = {};
    data.discovered = [];
    save();
  },
};
