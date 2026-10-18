// Paint-splat confetti. The simulation runs on the CPU (a few hundred
// numbers); drawing is one instanced WebGL2 draw call. The canvas is hidden
// whenever nothing is flying.

import { hexToRgb } from './color';
import { onFrame } from './render/ticker';

interface Splat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  rgb: [number, number, number];
  seed: number;
  kind: 0 | 1; // splat | ribbon
  life: number;
}

const LIFE = 3.2;
const MAX = 400;
const FLOATS = 12;

let canvas: HTMLCanvasElement | null = null;
let draw: (parts: Splat[]) => void;
let parts: Splat[] = [];
let stop: (() => void) | null = null;

const VERT = `#version 300 es
layout(location = 0) in vec4 aPos;    // x, y, r, rot
layout(location = 1) in vec4 aColor;  // rgb, alpha
layout(location = 2) in vec4 aShape;  // kind, flip, seed, -
uniform vec2 uView;
out vec2 vLocal;
flat out vec4 vColor;
flat out vec4 vShape;
flat out float vR;
void main() {
  int c = gl_VertexID % 6;
  vec2 corner = vec2(c == 1 || c == 2 || c == 4 ? 1.0 : -1.0, c == 2 || c == 4 || c == 5 ? 1.0 : -1.0);
  float ext = aPos.z * 2.4 + 2.0;
  vec2 local = corner * ext;
  float cs = cos(aPos.w), sn = sin(aPos.w);
  vec2 world = aPos.xy + vec2(local.x * cs - local.y * sn, local.x * sn + local.y * cs);
  gl_Position = vec4(world / uView * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  vLocal = local;
  vColor = aColor;
  vShape = aShape;
  vR = aPos.z;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vLocal;
flat in vec4 vColor;
flat in vec4 vShape;
flat in float vR;
out vec4 outColor;
const vec3 INK = vec3(43.0, 35.0, 64.0) / 255.0;
float hash(float s, float k) { return fract(sin(s * 12.9898 + k * 78.233) * 43758.5453); }
vec4 over(vec4 dst, vec3 c, float a) { return vec4(c * a, a) + dst * (1.0 - a); }
void main() {
  float r = vR;
  vec4 res = vec4(0.0);
  float d;
  if (vShape.x > 0.5) {
    // ribbon flipping over: squash the rounded rectangle vertically
    vec2 p = vec2(vLocal.x, vLocal.y / max(abs(vShape.y), 0.08));
    vec2 q = abs(p) - vec2(r, r * 0.45) + 3.0;
    d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 3.0;
    float aa = fwidth(d);
    res = over(res, vColor.rgb, clamp(0.5 - d / aa, 0.0, 1.0));
    res = over(res, INK, clamp((1.25 - abs(d)) / aa + 0.5, 0.0, 1.0));
  } else {
    d = length(vLocal) - r;
    float aa = fwidth(d);
    res = over(res, vColor.rgb, clamp(0.5 - d / aa, 0.0, 1.0));
    res = over(res, INK, clamp((1.25 - abs(d)) / aa + 0.5, 0.0, 1.0));
    int n = 2 + int(hash(vShape.z, 9.0) * 3.0);
    for (int k = 0; k < 4; k++) {
      if (k >= n) break;
      float fk = float(k);
      float a = hash(vShape.z, fk) * 6.2831853;
      float dist = r * (1.1 + hash(vShape.z, fk + 4.0) * 0.7);
      float rr = r * (0.18 + hash(vShape.z, fk + 8.0) * 0.25);
      float ds = length(vLocal - dist * vec2(cos(a), sin(a))) - rr;
      res = over(res, vColor.rgb, clamp(0.5 - ds / fwidth(ds), 0.0, 1.0));
    }
  }
  outColor = res * vColor.a;
}`;

function setupGL(c: HTMLCanvasElement) {
  const gl = c.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false })!;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
  const uView = gl.getUniformLocation(prog, 'uView');
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, MAX * FLOATS * 4, gl.DYNAMIC_DRAW);
  for (let i = 0; i < 3; i++) {
    gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i, 4, gl.FLOAT, false, FLOATS * 4, i * 16);
    gl.vertexAttribDivisor(i, 1);
  }
  const data = new Float32Array(MAX * FLOATS);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  draw = (ps) => {
    const n = Math.min(MAX, ps.length);
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      const o = i * FLOATS;
      data[o] = p.x;
      data[o + 1] = p.y;
      data[o + 2] = p.r;
      data[o + 3] = p.rot;
      data[o + 4] = p.rgb[0];
      data[o + 5] = p.rgb[1];
      data[o + 6] = p.rgb[2];
      data[o + 7] = Math.min(1, Math.max(0, LIFE - p.life));
      data[o + 8] = p.kind;
      data[o + 9] = Math.cos(p.life * 8);
      data[o + 10] = p.seed;
    }
    gl.viewport(0, 0, c.width, c.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.uniform2f(uView, innerWidth, innerHeight);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * FLOATS);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
  };
}

function ensure() {
  if (canvas) return;
  const c = (canvas = document.createElement('canvas'));
  c.className = 'confetti';
  c.style.display = 'none';
  document.body.appendChild(c);
  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(innerWidth * dpr);
    c.height = Math.round(innerHeight * dpr);
  };
  fit();
  addEventListener('resize', fit);
  setupGL(c);
}

/** Compile the shaders while the browser is idle, not in the middle of a celebration. */
export function warmup() {
  const run = () => ensure();
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1500 });
  else setTimeout(run, 300);
}

export function burst(colors: string[], { x = innerWidth / 2, y = innerHeight * 0.4, count = 90 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) count = Math.floor(count / 4);
  ensure();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 300 + Math.random() * 650;
    const color = colors[i % colors.length];
    parts.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 380,
      r: 5 + Math.random() * 9,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 10,
      rgb: hexToRgb(color).map((v) => v / 255) as [number, number, number],
      seed: Math.random() * 1000,
      kind: Math.random() < 0.3 ? 1 : 0,
      life: 0,
    });
  }
  if (parts.length > MAX) parts = parts.slice(-MAX);
  if (!stop) {
    canvas!.style.display = 'block';
    stop = onFrame((_now, dt) => step(dt));
  }
}

function step(dt: number) {
  for (const p of parts) {
    p.life += dt;
    p.vy += 900 * dt;
    p.vx *= 1 - 1.6 * dt;
    p.vy *= 1 - 0.9 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
  parts = parts.filter((p) => p.life < LIFE && p.y < innerHeight + 60);
  draw(parts);
  if (!parts.length) {
    stop!();
    stop = null;
    canvas!.style.display = 'none';
  }
}
