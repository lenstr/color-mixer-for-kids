// Spoken prompts for kids who can't read yet. Plays pre-rendered voice clips
// (public/voice/<id>.mp3) and falls back to the system Russian voice.

import { store } from './storage';
import { PHRASES } from './phrases';

const BASE = `${import.meta.env.BASE_URL}voice/`;

let current: HTMLAudioElement | null = null;
let queue: string[] = [];
let token = 0;
const missing = new Set<string>();

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

function playClip(id: string): Promise<void> {
  const text = PHRASES[id] ?? id;
  if (missing.has(id)) return tts(text);
  return new Promise((resolve) => {
    const a = new Audio(`${BASE}${id}.mp3`);
    current = a;
    a.onended = () => resolve();
    a.onerror = () => {
      missing.add(id);
      tts(text).then(resolve);
    };
    a.play().catch(() => resolve()); // autoplay blocked before first tap — skip quietly
  });
}

async function drain(my: number) {
  while (queue.length && my === token) {
    await playClip(queue.shift()!);
  }
}

/** Speak one or more phrases by id, interrupting whatever is playing. */
export function say(...ids: string[]) {
  if (!store.sound) return;
  hush();
  queue = ids;
  void drain(token);
}

export function hush() {
  token++;
  queue = [];
  if (current) {
    current.pause();
    current = null;
  }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

/** Warm the cache so the first clips play without a delay. */
export function preload(ids: string[]) {
  for (const id of ids) {
    const l = document.createElement('link');
    l.rel = 'prefetch';
    l.href = `${BASE}${id}.mp3`;
    document.head.appendChild(l);
  }
}
