// Tiny synthesized sound kit — no audio files needed.

import { store } from './storage';
import type { Pigment } from './color';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ac(): AudioContext | null {
  if (!store.sound) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  { at = 0, dur = 0.18, type = 'sine' as OscillatorType, vol = 0.4, slideTo = 0, attack = 0.005 } = {},
) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ at = 0, dur = 0.25, vol = 0.2, from = 1200, to = 300 } = {}) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + at;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

// Each paint has its own note, so tapping jars plays a little tune.
const NOTE: Record<Pigment, number> = {
  red: 523.25,
  yellow: 659.25,
  blue: 783.99,
  white: 1046.5,
  black: 392.0,
};

export const sfx = {
  tap() {
    tone(880, { dur: 0.06, type: 'triangle', vol: 0.18 });
  },
  squeeze(p: Pigment) {
    tone(NOTE[p], { dur: 0.16, type: 'triangle', vol: 0.25, slideTo: NOTE[p] * 1.5 });
  },
  plop(p: Pigment) {
    tone(NOTE[p] * 0.6, { dur: 0.22, vol: 0.5, slideTo: NOTE[p] * 0.25 });
    noise({ dur: 0.12, vol: 0.12, from: 2400, to: 600 });
  },
  undo() {
    tone(500, { dur: 0.16, type: 'triangle', vol: 0.25, slideTo: 260 });
  },
  pour() {
    noise({ dur: 0.7, vol: 0.35, from: 300, to: 2400 });
    tone(300, { dur: 0.5, type: 'sine', vol: 0.2, slideTo: 90 });
  },
  full() {
    tone(220, { dur: 0.14, type: 'square', vol: 0.12 });
    tone(196, { at: 0.15, dur: 0.2, type: 'square', vol: 0.12 });
  },
  hint() {
    [880, 1174.7, 1568].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.25, type: 'sine', vol: 0.2 }));
  },
  discover() {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
      tone(f, { at: i * 0.08, dur: 0.35, type: 'triangle', vol: 0.22 }),
    );
  },
  win() {
    const seq = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    seq.forEach((f, i) => tone(f, { at: i * 0.11, dur: 0.32, type: 'triangle', vol: 0.3 }));
    seq.forEach((f, i) => tone(f / 2, { at: i * 0.11, dur: 0.3, type: 'sine', vol: 0.18 }));
  },
  star(i: number) {
    tone(1046.5 * 1.26 ** i, { dur: 0.3, type: 'triangle', vol: 0.3 });
  },
};
