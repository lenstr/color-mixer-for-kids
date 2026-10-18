// Paint-splat confetti on a full-screen canvas.

interface Splat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  color: string;
  blobs: [number, number, number][]; // satellite droplets: angle, distance, radius
  kind: 'splat' | 'ribbon';
  life: number;
}

let canvas: HTMLCanvasElement;
let g: CanvasRenderingContext2D;
let parts: Splat[] = [];
let running = false;
let last = 0;

function ensure() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.appendChild(canvas);
  g = canvas.getContext('2d')!;
  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  addEventListener('resize', fit);
}

export function burst(colors: string[], { x = innerWidth / 2, y = innerHeight * 0.4, count = 90 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) count = Math.floor(count / 4);
  ensure();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 300 + Math.random() * 650;
    const r = 5 + Math.random() * 9;
    parts.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 380,
      r,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 10,
      color: colors[i % colors.length],
      blobs: Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => [
        Math.random() * Math.PI * 2,
        r * (1.1 + Math.random() * 0.7),
        r * (0.18 + Math.random() * 0.25),
      ]),
      kind: Math.random() < 0.3 ? 'ribbon' : 'splat',
      life: 0,
    });
  }
  if (!running) {
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }
}

function tick(now: number) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  g.clearRect(0, 0, innerWidth, innerHeight);
  for (const p of parts) {
    p.life += dt;
    p.vy += 900 * dt;
    p.vx *= 1 - 1.6 * dt;
    p.vy *= 1 - 0.9 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    const fade = Math.min(1, Math.max(0, 3.2 - p.life));
    g.save();
    g.globalAlpha = fade;
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    g.fillStyle = p.color;
    g.strokeStyle = '#2B2340';
    g.lineWidth = 2.5;
    if (p.kind === 'ribbon') {
      g.scale(1, Math.cos(p.life * 8));
      g.beginPath();
      g.roundRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9, 3);
      g.fill();
      g.stroke();
    } else {
      g.beginPath();
      g.arc(0, 0, p.r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      for (const [a, d, r] of p.blobs) {
        g.beginPath();
        g.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }
  parts = parts.filter((p) => p.life < 3.2 && p.y < innerHeight + 60);
  if (parts.length) requestAnimationFrame(tick);
  else {
    running = false;
    g.clearRect(0, 0, innerWidth, innerHeight);
  }
}
