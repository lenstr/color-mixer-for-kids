// Pre-renders all game phrases with ElevenLabs into public/voice/*.mp3.
//
//   ELEVENLABS_API_KEY=... bun scripts/generate-voice.ts          # only missing files
//   ELEVENLABS_API_KEY=... bun scripts/generate-voice.ts --force  # re-render all
//   bun scripts/generate-voice.ts --key-file /path/to/key
//   bun scripts/generate-voice.ts --only name-mint,task-purple  # re-render a few
//
// The key is only used here, at build time; it never ships with the game.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PHRASES } from '../src/phrases';

const VOICE_ID = process.env.VOICE_ID ?? 'GN4wbsbejSnGSa1AzjH5'; // Ekaterina — soft, playful, native Russian
const MODEL = 'eleven_multilingual_v2';
const OUT = join(import.meta.dir, '..', 'public', 'voice');

const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const force = args.includes('--force') || !!only;
const keyFile = args[args.indexOf('--key-file') + 1];
const key = (args.includes('--key-file') ? readFileSync(keyFile, 'utf8') : process.env.ELEVENLABS_API_KEY ?? '').trim();
if (!key) {
  console.error('Set ELEVENLABS_API_KEY or pass --key-file <path>');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

async function render(id: string, text: string) {
  const file = join(OUT, `${id}.mp3`);
  if (!force && existsSync(file)) return 'skip';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_96`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: MODEL,
          language_code: 'ru',
          voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
        }),
      },
    );
    if (res.ok) {
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return 'ok';
    }
    const msg = await res.text();
    if (res.status !== 429 && res.status < 500) throw new Error(`${id}: ${res.status} ${msg.slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(`${id}: gave up after retries`);
}

const entries = Object.entries(PHRASES).filter(([id]) => !only || only.has(id));
let done = 0;
// A few requests in parallel keeps us under the API concurrency limit.
const queue = [...entries];
await Promise.all(
  Array.from({ length: 3 }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const [id, text] = item;
      const status = await render(id, text);
      done++;
      console.log(`[${done}/${entries.length}] ${status.padEnd(4)} ${id}: ${text}`);
    }
  }),
);
