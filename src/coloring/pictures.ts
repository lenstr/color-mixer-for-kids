// Coloring pages. Each picture is a stack of paintable regions in a 400×400
// artboard, bottom to top, plus decoration (faces, veins, rays) drawn over
// them that cannot be painted. A region's `target` is the id of the color
// it really is (see data.ts); hints and the "task" mode compare against it.

import { INK } from '../palette';

export interface Region {
  id: string;
  target: string;
  d: string;
  /** id of a region below that this one is clipped to (spots inside a cap) */
  clip?: string;
}

export interface Picture {
  id: string;
  name: string;
  /** accusative, for "Раскрась яблоко!" */
  acc: string;
  regions: Region[];
  /** SVG markup over the regions, in the same artboard */
  deco: string;
}

// ---------- shape helpers ----------

/** A coordinate rounded to 0.1, short in path data. */
const n = (v: number) => Math.round(v * 10) / 10;

function circle(cx: number, cy: number, r: number) {
  return `M${n(cx - r)} ${n(cy)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, deg = 0) {
  const a = (deg * Math.PI) / 180;
  const dx = rx * Math.cos(a);
  const dy = rx * Math.sin(a);
  const p1 = `${n(cx + dx)} ${n(cy + dy)}`;
  const p2 = `${n(cx - dx)} ${n(cy - dy)}`;
  return `M${p1}A${rx} ${ry} ${deg} 1 1 ${p2}A${rx} ${ry} ${deg} 1 1 ${p1}Z`;
}

function rect(x: number, y: number, w: number, h: number, r = 0) {
  if (!r) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  return `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
}

/** Half ring of the rainbow, centered at (cx, cy). */
function band(cx: number, cy: number, R: number, r: number) {
  return `M${cx - R} ${cy}A${R} ${R} 0 0 1 ${cx + R} ${cy}L${cx + r} ${cy}A${r} ${r} 0 0 0 ${cx - r} ${cy}Z`;
}

const SKY = rect(0, 0, 400, 400);
const ground = (y: number) => `M0 ${y}C120 ${y - 16} 280 ${y - 16} 400 ${y}V400H0Z`;

// ---------- decoration helpers ----------

const line = (d: string, w = 5) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const gloss = (d: string, w = 11) =>
  `<path d="${d}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" opacity=".7"/>`;
const dot = (cx: number, cy: number, r: number, fill = INK) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
/** Two eyes and a smile, centered at (x, y), `s` = scale. */
function face(x: number, y: number, s = 1, color = INK) {
  const e = (ex: number) =>
    `<ellipse cx="${n(x + ex * s)}" cy="${y}" rx="${n(5 * s)}" ry="${n(7 * s)}" fill="${color}"/><circle cx="${n(x + ex * s + 1.6 * s)}" cy="${n(y - 2.4 * s)}" r="${n(1.8 * s)}" fill="#fff"/>`;
  const smile = `M${n(x - 10 * s)} ${n(y + 14 * s)}Q${x} ${n(y + 23 * s)} ${n(x + 10 * s)} ${n(y + 14 * s)}`;
  return `${e(-17)}${e(17)}<path d="${smile}" fill="none" stroke="${color}" stroke-width="${n(4.5 * s)}" stroke-linecap="round"/>`;
}
const grass = (xs: number[], y: number) => line(xs.map((x) => `M${x} ${y}l-5 -14M${x + 8} ${y + 2}l3 -15`).join(''), 4);
function rays(cx: number, cy: number, r1: number, r2: number, count = 8, from = 0) {
  let d = '';
  for (let i = 0; i < count; i++) {
    const a = ((from + (i * 360) / count) * Math.PI) / 180;
    d += `M${n(cx + Math.cos(a) * r1)} ${n(cy + Math.sin(a) * r1)}L${n(cx + Math.cos(a) * r2)} ${n(cy + Math.sin(a) * r2)}`;
  }
  return line(d, 5);
}

// ---------- pictures ----------

const apple: Picture = (() => {
  const body =
    'M200 128C168 100 92 104 86 186C80 262 132 340 176 340C188 340 192 333 200 333C208 333 212 340 224 340C268 340 320 262 314 186C308 104 232 100 200 128Z';
  return {
    id: 'apple',
    name: 'Яблоко',
    acc: 'яблоко',
    regions: [
      { id: 'sky', target: 'skyblue', d: SKY },
      { id: 'grass', target: 'green', d: ground(352) },
      { id: 'body', target: 'red', d: body },
      { id: 'stem', target: 'brown', d: 'M193 132C192 110 196 90 206 72L219 78C210 94 207 112 208 132Z' },
      { id: 'leaf', target: 'green', d: 'M214 96C236 62 282 58 306 74C290 106 248 116 214 96Z' },
    ],
    deco:
      line('M222 93C246 83 272 76 298 75', 4) +
      gloss('M118 180C116 158 128 140 146 132') +
      dot(124, 210, 6, '#fff') +
      face(200, 230, 1.15) +
      grass([40, 120, 300, 360], 384),
  };
})();

const mushroom: Picture = (() => {
  const cap = 'M70 214C66 110 140 70 200 70C260 70 334 110 330 214C280 232 120 232 70 214Z';
  return {
    id: 'mushroom',
    name: 'Грибок',
    acc: 'грибок',
    regions: [
      { id: 'sky', target: 'skyblue', d: SKY },
      { id: 'grass', target: 'green', d: ground(330) },
      { id: 'stem', target: 'peach', d: 'M158 210C150 260 146 310 154 350C180 362 222 362 248 350C256 310 252 260 244 210Z' },
      { id: 'cap', target: 'red', d: cap },
      { id: 'spot1', target: 'white', d: circle(128, 158, 21), clip: 'cap' },
      { id: 'spot2', target: 'white', d: circle(200, 112, 25), clip: 'cap' },
      { id: 'spot3', target: 'white', d: circle(272, 160, 19), clip: 'cap' },
      { id: 'spot4', target: 'white', d: circle(184, 184, 13), clip: 'cap' },
      { id: 'spot5', target: 'white', d: circle(316, 200, 16), clip: 'cap' },
    ],
    deco: gloss('M104 168C108 136 128 112 152 100', 9) + face(201, 268, 1) + grass([30, 90, 300, 350], 372),
  };
})();

const carrot: Picture = {
  id: 'carrot',
  name: 'Морковка',
  acc: 'морковку',
  regions: [
    { id: 'sky', target: 'skyblue', d: SKY },
    { id: 'soil', target: 'brown', d: 'M0 300C120 284 280 284 400 300V400H0Z' },
    { id: 'leaf1', target: 'green', d: 'M190 122C150 102 120 62 128 30C160 40 190 80 200 118Z' },
    { id: 'leaf2', target: 'lime', d: 'M196 120C190 80 196 40 214 16C232 44 226 86 210 120Z' },
    { id: 'leaf3', target: 'green', d: 'M206 122C226 82 262 52 290 56C284 90 246 116 212 126Z' },
    {
      id: 'root',
      target: 'carrot',
      d: 'M146 128C168 112 238 112 258 128C270 150 250 230 214 330C208 346 196 346 190 330C156 230 134 150 146 128Z',
    },
  ],
  deco:
    line('M162 214L180 218M228 248L244 242M178 278L194 282M214 306L226 302', 4.5) +
    gloss('M164 140C158 160 160 186 168 206', 9) +
    face(202, 160, 1) +
    line('M60 350l10 4M300 330l12 -3M340 372l9 5', 4),
};

const flower: Picture = (() => {
  const petals = Array.from({ length: 6 }, (_, i) => {
    const deg = i * 60 - 90;
    const a = (deg * Math.PI) / 180;
    return {
      id: `petal${i + 1}`,
      target: i % 2 ? 'lilac' : 'pink',
      d: ellipse(200 + Math.cos(a) * 54, 150 + Math.sin(a) * 54, 38, 27, deg),
    };
  });
  return {
    id: 'flower',
    name: 'Цветок',
    acc: 'цветок',
    regions: [
      { id: 'sky', target: 'skyblue', d: SKY },
      { id: 'table', target: 'honey', d: rect(0, 370, 400, 30) },
      { id: 'stem', target: 'green', d: 'M194 196C190 230 192 262 196 296L206 296C204 262 206 230 206 196Z' },
      { id: 'leafL', target: 'lime', d: 'M196 258C172 232 142 232 126 246C146 272 176 274 196 264Z' },
      { id: 'leafR', target: 'lime', d: 'M204 236C226 210 258 208 274 222C256 248 226 252 204 244Z' },
      { id: 'pot', target: 'carrot', d: 'M142 300L258 300L244 372L156 372Z' },
      { id: 'rim', target: 'brown', d: rect(130, 284, 140, 28, 8) },
      ...petals,
      { id: 'center', target: 'yellow', d: circle(200, 150, 31) },
    ],
    deco:
      face(200, 146, 0.62) +
      line('M136 248C156 252 176 256 192 260M208 240C228 232 248 226 266 224', 3.5) +
      gloss('M162 322L166 352', 8),
  };
})();

const fish: Picture = (() => {
  const body = 'M110 200C140 130 262 118 316 200C262 282 140 270 110 200Z';
  return {
    id: 'fish',
    name: 'Рыбка',
    acc: 'рыбку',
    regions: [
      { id: 'water', target: 'skyblue', d: SKY },
      { id: 'sand', target: 'honey', d: ground(350) },
      { id: 'weed1', target: 'green', d: 'M56 362C36 320 80 292 58 252C52 232 64 216 72 232C92 270 60 302 82 362Z' },
      { id: 'weed2', target: 'lime', d: 'M330 362C314 322 350 296 334 262C330 248 340 236 348 248C364 280 334 310 352 362Z' },
      { id: 'tail', target: 'yellow', d: 'M130 200L64 148C80 184 80 216 64 252Z' },
      { id: 'finTop', target: 'yellow', d: 'M246 172C238 128 210 102 156 100C178 124 182 150 170 176Z' },
      { id: 'finBottom', target: 'yellow', d: 'M232 232C226 262 208 282 176 294C184 272 186 254 180 230Z' },
      { id: 'body', target: 'orange', d: body },
      { id: 'stripe1', target: 'white', d: 'M170 110C190 160 190 240 170 290L200 290C218 240 218 160 200 110Z', clip: 'body' },
      { id: 'stripe2', target: 'white', d: 'M244 110C258 160 258 240 244 290L268 290C282 240 282 160 268 110Z', clip: 'body' },
      { id: 'eye', target: 'white', d: circle(284, 186, 14) },
      { id: 'bubble1', target: 'white', d: circle(334, 112, 14) },
      { id: 'bubble2', target: 'white', d: circle(356, 70, 10) },
      { id: 'bubble3', target: 'white', d: circle(326, 40, 7) },
    ],
    deco:
      dot(287, 187, 7) +
      dot(290, 183, 2.5, '#fff') +
      line('M292 220Q302 222 306 214', 4.5) +
      gloss('M140 176C152 160 170 150 190 146', 8) +
      line('M96 196L118 200M92 176L116 190M92 222L116 208', 3.5),
  };
})();

const house: Picture = {
  id: 'house',
  name: 'Домик',
  acc: 'домик',
  regions: [
    { id: 'sky', target: 'skyblue', d: SKY },
    { id: 'sun', target: 'yellow', d: circle(334, 68, 32) },
    {
      id: 'cloud',
      target: 'white',
      d: 'M44 110C24 110 22 84 44 82C46 60 76 54 88 72C98 54 130 60 128 84C146 86 146 110 126 110Z',
    },
    { id: 'grass', target: 'green', d: ground(326) },
    { id: 'chimney', target: 'gray', d: rect(246, 108, 28, 72) },
    { id: 'walls', target: 'peach', d: rect(112, 188, 176, 144) },
    { id: 'roof', target: 'burgundy', d: 'M88 198L200 100L312 198Z' },
    { id: 'door', target: 'brown', d: 'M178 332V270A22 22 0 0 1 222 270V332Z' },
    { id: 'window1', target: 'skyblue', d: rect(128, 216, 40, 40, 5) },
    { id: 'window2', target: 'skyblue', d: rect(232, 216, 40, 40, 5) },
  ],
  deco:
    line('M148 216V256M128 236H168M252 216V256M232 236H272', 4) +
    dot(213, 302, 4) +
    rays(334, 68, 42, 56, 8, 22) +
    grass([30, 70, 320, 360], 372) +
    face(334, 64, 0.55),
};

const ladybug: Picture = (() => {
  const body = circle(200, 225, 98);
  return {
    id: 'ladybug',
    name: 'Божья коровка',
    acc: 'божью коровку',
    regions: [
      { id: 'sky', target: 'mint', d: SKY },
      { id: 'leaf', target: 'green', d: 'M30 340C50 200 200 116 370 86C360 240 226 356 30 340Z' },
      { id: 'head', target: 'black', d: circle(200, 128, 46) },
      { id: 'body', target: 'red', d: body },
      { id: 'spot1', target: 'black', d: circle(148, 184, 21), clip: 'body' },
      { id: 'spot2', target: 'black', d: circle(252, 184, 21), clip: 'body' },
      { id: 'spot3', target: 'black', d: circle(140, 260, 18), clip: 'body' },
      { id: 'spot4', target: 'black', d: circle(260, 260, 18), clip: 'body' },
      { id: 'spot5', target: 'black', d: circle(104, 222, 14), clip: 'body' },
      { id: 'spot6', target: 'black', d: circle(296, 222, 14), clip: 'body' },
    ],
    deco:
      line('M56 326C76 314 94 302 112 290M300 160C320 140 340 118 360 96', 4) +
      line('M200 132V322') +
      line('M184 88C176 62 160 50 146 52M216 88C224 62 240 50 254 52', 4.5) +
      dot(146, 52, 7) +
      dot(254, 52, 7) +
      `<ellipse cx="183" cy="102" rx="10" ry="12" fill="#fff"/><ellipse cx="217" cy="102" rx="10" ry="12" fill="#fff"/>` +
      dot(185, 104, 5) +
      dot(219, 104, 5) +
      `<path d="M190 118Q200 125 210 118" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>` +
      gloss('M134 160C146 146 162 138 178 134', 9),
  };
})();

const rainbow: Picture = (() => {
  const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
  const bands = colors.map((c, i) => ({ id: `band${i + 1}`, target: c, d: band(200, 300, 176 - i * 25, 151 - i * 25) }));
  return {
    id: 'rainbow',
    name: 'Радуга',
    acc: 'радугу',
    regions: [
      { id: 'sky', target: 'skyblue', d: SKY },
      { id: 'sun', target: 'yellow', d: circle(338, 66, 30) },
      { id: 'grass', target: 'green', d: ground(356) },
      ...bands,
      {
        id: 'cloudL',
        target: 'white',
        d: 'M16 334C-4 330 0 294 30 296C26 262 70 250 88 272C102 244 152 248 156 276C182 268 204 296 188 320C200 336 186 348 168 344C120 352 60 350 16 334Z',
      },
      {
        id: 'cloudR',
        target: 'white',
        d: 'M384 334C404 330 400 294 370 296C374 262 330 250 312 272C298 244 248 248 244 276C218 268 196 296 212 320C200 336 214 348 232 344C280 352 340 350 384 334Z',
      },
    ],
    deco: rays(338, 66, 40, 54, 8, 0) + face(100, 300, 0.7) + face(300, 300, 0.7) + grass([20, 380], 390),
  };
})();

/** In the order kids meet them, simplest first. */
export const PICTURES: Picture[] = [apple, mushroom, carrot, flower, fish, house, ladybug, rainbow];

export const PICTURE_BY_ID = Object.fromEntries(PICTURES.map((p) => [p.id, p])) as Record<string, Picture>;

/** Shape and decoration helpers, for pictures drawn elsewhere (the story's glade). */
export { SKY, circle, dot, ellipse, gloss, grass, line, n, rays, rect };
