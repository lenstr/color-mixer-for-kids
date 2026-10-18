// One requestAnimationFrame loop for everything that animates from JS.
// Callbacks receive the frame time and the real elapsed seconds, so motion
// runs at the same speed on 60 Hz and 120 Hz screens.

type Frame = (now: number, dt: number) => void;

const frames = new Set<Frame>();
let raf = 0;
let last = 0;

function loop(now: number) {
  const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
  last = now;
  raf = 0;
  frames.forEach((f) => f(now, dt));
  if (frames.size) raf = requestAnimationFrame(loop);
  else last = 0;
}

/** Run `fn` every frame until the returned function is called. */
export function onFrame(fn: Frame): () => void {
  frames.add(fn);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => {
    frames.delete(fn);
  };
}

// Background tabs pause rAF; start the clock fresh instead of jumping.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) last = 0;
});
