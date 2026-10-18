// Spoken prompts for kids who can't read yet. Plays pre-rendered voice clips
// (public/voice/<id>.mp3) and falls back to the system Russian voice.

import { store } from './storage';
import { PHRASES } from './phrases';
import { voiceChannel } from './audio';

const BASE = `${import.meta.env.BASE_URL}voice/`;

let queue: string[] = [];
let token = 0;

let ttsVoice: SpeechSynthesisVoice | null = null;
if ('speechSynthesis' in window) {
  const pick = () => {
    const ru = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ru'));
    ttsVoice = ru.find((v) => /milena|premium|enhanced/i.test(v.name)) ?? ru[0] ?? null;
  };
  pick();
  speechSynthesis.addEventListener('voiceschanged', pick);
}

function tts(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU';
    if (ttsVoice) u.voice = ttsVoice;
    u.rate = 0.95;
    u.pitch = 1.15;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

// Clips are decoded and played through Web Audio, the same context as the
// sound effects. Plain <audio> elements need their own tap on iOS (delayed
// prompts went silent) and make Safari send Range requests that the offline
// cache cannot answer.
const clips = new Map<string, Promise<AudioBuffer | null>>();
let current: AudioBufferSourceNode | null = null;

function clip(id: string) {
  let p = clips.get(id);
  if (!p) {
    const { ctx } = voiceChannel();
    p = fetch(`${BASE}${id}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((buf) => (buf ? ctx.decodeAudioData(buf) : null))
      .catch(() => null);
    clips.set(id, p);
  }
  return p;
}

async function playClip(id: string, my: number): Promise<void> {
  const text = PHRASES[id] ?? id;
  const buffer = await clip(id);
  if (my !== token) return;
  if (!buffer) return tts(text);
  const { ctx, out } = voiceChannel();
  if (ctx.state !== 'running') {
    await ctx.resume().catch(() => {});
    // still locked: no tap yet, skip quietly
    if ((ctx.state as AudioContextState) !== 'running') return;
  }
  return new Promise((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(out);
    src.onended = () => {
      current = null;
      resolve();
    };
    current = src;
    src.start();
  });
}

async function drain(my: number) {
  while (queue.length && my === token) {
    await playClip(queue.shift()!, my);
  }
}

/** Speak one or more phrases by id, interrupting whatever is playing. */
export function say(...ids: string[]) {
  if (!store.sound) return;
  hush();
  queue = ids;
  void drain(token);
}

export const speaking = () => current !== null;

export function hush() {
  token++;
  queue = [];
  if (current) {
    current.onended = null;
    try {
      current.stop();
    } catch {
      /* already stopped */
    }
    current = null;
  }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

/** Load clips ahead of time so they play without a delay. */
export function preload(ids: string[]) {
  ids.forEach((id) => void clip(id));
}
