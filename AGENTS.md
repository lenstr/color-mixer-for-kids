# AGENTS.md — Клякса (color-mixer-for-kids)

A paint-mixing game for children aged 3–7: Vite + TypeScript, no framework, WebGL2 rendering,
installable offline PWA. `README.md` describes the gameplay, colour mixing, rendering and voice
pipeline; read the section that matches your change.

## Language

- Russian: everything the child sees or hears (UI text, `src/phrases.ts`) and `README.md`.
- English: code, comments, commit messages and this file.
- Commits follow Conventional Commits, as in `git log`: `feat(pwa): ...`, `fix(ui): ...`.

## Public repository

The repository is public and every push to `main` deploys the game to GitHub Pages
(`.github/workflows/pages.yml`), so a push is a release to real players. Push only when the user
asks.

Machine-specific settings (addresses, hosts) go to `.env.local`, which git ignores. Keep local
paths, LAN addresses and keys out of tracked files.

## Dev server

The dev server is the `web` daemon in `mise.toml`, supervised in the background by pitchfork
(mise's experimental `[daemons]`). `mise install` provides Node and pitchfork:

```sh
mise daemons ls  # is it already running?
mise run dev     # start in the background; a no-op when it already runs
mise run logs    # its output
mise run stop    # stop
```

Run the server only through the daemon: a separate `npm run dev` fails on the fixed port
(`--strictPort`). Vite reloads on file changes and restarts on `vite.config.ts` changes by
itself. The listen address comes from `DEV_HOST` in `.env.local`; read the URL from
`mise run logs` rather than assuming `localhost`.

## Verification

`npm run build` (`tsc --noEmit` + `vite build`) is the only automated check: there are no tests
and no linter. For a visible change, also open the dev server in a browser with WebGL2 and check
the console. Layout changes need both a phone-sized and a desktop viewport.

## Voice

Every spoken phrase is pre-rendered from `src/phrases.ts` into `public/voice/<id>.mp3` with
ElevenLabs. After adding or changing a phrase, ask the user to run `scripts/generate-voice.ts`
(it needs their API key) or to accept the system-voice fallback for now; never commit a key.
