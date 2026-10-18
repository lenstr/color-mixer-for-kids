// WebGL2 renderer for the blob: one full-quad fragment shader draws the
// shadow, body, paint swirls, shading, gloss, outline and face from signed
// distance fields. The GPU redraws a small texture each frame instead of the
// browser re-rasterising an SVG with masks and gradients on the CPU.

import { hexToRgb } from '../color';
import { type BlobFrame, GROUND, MOODS } from './shape';

// The canvas covers more than the 300×250 layout box so hops and squashes
// are never clipped: x −180…180, y −230…110 in blob units.
const VIEW = { x0: -180, y0: -230, w: 360, h: 340 };
const MAX_SWIRLS = 4;

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec4 uView;          // x0, y0, w, h
uniform float uR[9];
uniform vec4 uXform;         // sx, sy, tx, ty
uniform vec2 uShadow;        // rx, opacity
uniform vec3 uColor;
uniform int uSwirlN;
uniform vec4 uSwirl[${MAX_SWIRLS}];     // rot, scale, opacity
uniform vec3 uSwirlColor[${MAX_SWIRLS}];
uniform vec2 uLook;
uniform float uBlink;
uniform int uMood;
uniform bool uFace;
out vec4 outColor;

const float PI = 3.14159265;
const vec3 INK = vec3(43.0, 35.0, 64.0) / 255.0;
const vec3 WHITE = vec3(1.0);
const vec3 MOUTH = vec3(59.0, 28.0, 46.0) / 255.0;

float upp;   // blob units per pixel
float pxs;   // pixels per local unit (inside the squash transform)

vec4 over(vec4 dst, vec3 c, float a) { return vec4(c * a, a) + dst * (1.0 - a); }
float fill(float d) { return clamp(0.5 - d * pxs, 0.0, 1.0); }
float stroke(float d, float w) { return clamp(w * 0.5 * pxs + 0.5 - abs(d) * pxs, 0.0, 1.0); }

float sdEllipse(vec2 p, vec2 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r)) + 1e-5;
  return k0 * (k0 - 1.0) / k1;
}

float dot2(vec2 v) { return dot(v, v); }
// Distance to a quadratic Bézier (Inigo Quilez).
float sdBezier(vec2 pos, vec2 A, vec2 B, vec2 C) {
  vec2 a = B - A, b = A - 2.0 * B + C, c = a * 2.0, d = A - pos;
  float kk = 1.0 / dot(b, b);
  float kx = kk * dot(a, b);
  float ky = kk * (2.0 * dot(a, a) + dot(d, b)) / 3.0;
  float kz = kk * dot(d, a);
  float p = ky - kx * kx, q = kx * (2.0 * kx * kx - 3.0 * ky) + kz;
  float h = q * q + 4.0 * p * p * p;
  float res;
  if (h >= 0.0) {
    h = sqrt(h);
    vec2 x = (vec2(h, -h) - q) / 2.0;
    vec2 uv = sign(x) * pow(abs(x), vec2(1.0 / 3.0));
    float t = clamp(uv.x + uv.y - kx, 0.0, 1.0);
    res = dot2(d + (c + b * t) * t);
  } else {
    float z = sqrt(-p);
    float v = acos(q / (p * z * 2.0)) / 3.0;
    float m = cos(v), n = sin(v) * 1.732050808;
    vec3 t = clamp(vec3(m + m, -n - m, n - m) * z - kx, 0.0, 1.0);
    res = min(dot2(d + (c + b * t.x) * t.x), dot2(d + (c + b * t.y) * t.y));
  }
  return sqrt(res);
}

// Radius of the outline at angle th: closed Catmull-Rom through uR.
float radiusAt(float th) {
  float f = mod((th + PI * 0.5) / (2.0 * PI) * 9.0, 9.0);
  float fi = floor(f);
  float u = f - fi;
  int i = int(fi);
  float r0 = uR[(i + 8) % 9], r1 = uR[i], r2 = uR[(i + 1) % 9], r3 = uR[(i + 2) % 9];
  return 0.5 * (2.0 * r1 + (r2 - r0) * u + (2.0 * r0 - 5.0 * r1 + 4.0 * r2 - r3) * u * u + (3.0 * r1 - r0 - 3.0 * r2 + r3) * u * u * u);
}

// Signed distance-ish to the body in local units (negative inside).
float bodyField(vec2 q) {
  vec2 w = q;
  // the SVG spline widens its bottom points by 4%; spread that smoothly
  w.x /= mix(1.0, 1.04, smoothstep(0.0, 80.0, w.y));
  // undo the flattened bottom (y > 58 squeezed to 42%) with a soft knee,
  // which gives the rounded "sitting" corners of the spline version
  w.y += (1.0 / 0.42 - 1.0) * 8.0 * log(1.0 + exp((w.y - 58.0) / 8.0));
  w.y += 6.0;
  w.x /= 1.06;
  return length(w) - radiusAt(atan(w.y, w.x));
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes;
  vec2 p = uView.xy + frag * uView.zw;
  upp = uView.z / uRes.x;
  vec2 q = (p - uXform.zw) / uXform.xy;
  pxs = 0.5 * (uXform.x + uXform.y) / upp;

  vec4 res = vec4(0.0);

  // shadow on the floor (outside the squash transform)
  float sh = sdEllipse(p - vec2(0.0, ${GROUND + 4}.0), vec2(uShadow.x, 12.0));
  res = over(res, INK, clamp(0.5 - sh / upp, 0.0, 1.0) * uShadow.y);

  // body: distance in pixels via screen-space derivatives
  float bf = bodyField(q);
  float bpx = bf / max(length(vec2(dFdx(bf), dFdy(bf))), 1e-4);
  float bodyA = clamp(0.5 - bpx, 0.0, 1.0);
  float lineA = clamp(3.25 * pxs + 0.5 - abs(bpx), 0.0, 1.0);

  if (bodyA > 0.0) {
    vec3 col = uColor;
    for (int i = 0; i < ${MAX_SWIRLS}; i++) {
      if (i >= uSwirlN) break;
      vec4 S = uSwirl[i];
      vec2 s = q - vec2(0.0, -14.0);
      float c = cos(-S.x), sn = sin(-S.x);
      s = mat2(c, sn, -sn, c) * s / S.y;
      float rho = length(s);
      float ph = atan(s.y, s.x);
      if (ph < 0.0) ph += 2.0 * PI;
      float dd = rho - 26.0;
      float k0 = floor(((rho - 4.0) / 15.0 - ph) / (2.0 * PI));
      for (int j = 0; j < 2; j++) {
        float a = clamp(ph + 2.0 * PI * (k0 + float(j)), 0.0, 3.4 * PI);
        dd = min(dd, length(s - (4.0 + 15.0 * a) * vec2(cos(a), sin(a))) - 11.0);
      }
      col = mix(col, uSwirlColor[i], clamp(0.5 - dd * S.y * pxs, 0.0, 1.0) * S.z);
    }
    // radial shading
    float g = length(q - vec2(-36.0, -60.0)) / 225.0;
    if (g < 0.45) col = mix(col, WHITE, mix(0.28, 0.0, g / 0.45));
    else col = mix(col, vec3(0.0), g < 0.8 ? mix(0.0, 0.06, (g - 0.45) / 0.35) : mix(0.06, 0.24, clamp((g - 0.8) / 0.2, 0.0, 1.0)));
    // gloss
    float ca = cos(radians(38.0)), sa = sin(radians(38.0));
    vec2 e = mat2(ca, sa, -sa, ca) * (q - vec2(-48.0, -52.0));
    col = mix(col, WHITE, fill(sdEllipse(e, vec2(24.0, 11.0))) * 0.6);
    col = mix(col, WHITE, fill(length(q - vec2(-22.0, -72.0)) - 5.5) * 0.6);
    col = mix(col, WHITE, stroke(sdBezier(q, vec2(62.0, 30.0), vec2(74.0, 6.0), vec2(66.0, -18.0)), 6.0) * 0.25);
    res = over(res, col, bodyA);
  }
  res = over(res, INK, lineA);

  if (!uFace) { outColor = res; return; }

  vec2 f = q - uLook * vec2(0.6, 0.4);
  if (abs(f.x) > 80.0 || f.y < -48.0 || f.y > 56.0) { outColor = res; return; }

  // cheeks
  for (int k = -1; k <= 1; k += 2) {
    res = over(res, vec3(1.0, 0.373, 0.561), fill(sdEllipse(f - vec2(60.0 * float(k), 10.0), vec2(13.0, 8.0))) * 0.38);
  }

  // eyes
  for (int k = -1; k <= 1; k += 2) {
    float ex = 34.0 * float(k);
    if (uMood == 2) {
      res = over(res, INK, stroke(sdBezier(f, vec2(ex - 14.0, -12.0), vec2(ex, -34.0), vec2(ex + 14.0, -12.0)), 6.0));
      continue;
    }
    vec2 e = f - vec2(ex, -18.0);
    e.y /= uBlink;
    float de = sdEllipse(e, vec2(17.0, 20.0));
    res = over(res, WHITE, fill(de));
    res = over(res, INK, stroke(de, 5.0));
    vec2 pp = e - uLook - vec2(0.0, 2.0);
    res = over(res, INK, fill(length(pp) - 9.5));
    res = over(res, WHITE, fill(length(pp - vec2(3.5, -4.5)) - 3.4));
  }

  // mouth
  float dm = 1e5;      // filled shapes
  float ds = 1e5;      // strokes
  if (uMood == 0) ds = sdBezier(f, vec2(-17.0, 20.0), vec2(0.0, 34.0), vec2(17.0, 20.0));
  else if (uMood == 1) dm = sdEllipse(f - vec2(0.0, 24.0), vec2(11.0, 10.5));
  else if (uMood == 2) dm = max(sdEllipse(f - vec2(0.0, 15.0), vec2(25.0, 32.0)), 16.0 - f.y);
  else if (uMood == 3) ds = min(sdBezier(f, vec2(-16.0, 24.0), vec2(-8.0, 16.0), vec2(0.0, 24.0)), sdBezier(f, vec2(0.0, 24.0), vec2(8.0, 32.0), vec2(16.0, 24.0)));
  else if (uMood == 4) dm = sdEllipse(f - vec2(0.0, 26.0), vec2(7.0, 5.3));
  else ds = min(sdBezier(f, vec2(-16.0, 29.0), vec2(-8.0, 20.0), vec2(0.0, 27.0)), sdBezier(f, vec2(0.0, 27.0), vec2(8.0, 34.0), vec2(16.0, 25.0)));
  if (dm < 1e4) {
    res = over(res, MOUTH, fill(dm));
    if (uMood == 2) {
      float tongue = max(sdEllipse(f - vec2(4.0, 40.0), vec2(11.0, 7.0)), dm);
      res = over(res, vec3(1.0, 0.478, 0.604), fill(tongue));
    }
    res = over(res, INK, stroke(dm, 5.5));
  }
  if (ds < 1e4) res = over(res, INK, stroke(ds, 5.5));

  outColor = res;
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
  return s;
}

const rgb = (hex: string) => hexToRgb(hex).map((v) => v / 255) as [number, number, number];

export class GlBlobView {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private prog!: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private ro: ResizeObserver;
  private withFace: boolean;
  private swirlBuf = new Float32Array(MAX_SWIRLS * 4);
  private swirlColBuf = new Float32Array(MAX_SWIRLS * 3);
  private lost = false;

  constructor(withFace: boolean) {
    this.withFace = withFace;
    this.el = document.createElement('div');
    this.el.className = 'paint-blob';
    this.canvas = document.createElement('canvas');
    this.el.append(this.canvas);
    this.gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false })!;
    this.init();
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.init();
    });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
  }

  private init() {
    const gl = this.gl;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
    this.prog = prog;
    for (const n of ['uRes', 'uView', 'uR', 'uXform', 'uShadow', 'uColor', 'uSwirlN', 'uSwirl', 'uSwirlColor', 'uLook', 'uBlink', 'uMood', 'uFace']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }
    gl.bindVertexArray(gl.createVertexArray());
    gl.disable(gl.BLEND);
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    // Cap the pixel density: past 2.5× the thick cartoon lines look the same
    // and the GPU would shade many more pixels.
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  draw(f: BlobFrame) {
    if (this.lost) return;
    const gl = this.gl;
    const u = this.u;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform4f(u.uView, VIEW.x0, VIEW.y0, VIEW.w, VIEW.h);
    gl.uniform1fv(u.uR, f.radii);
    gl.uniform4f(u.uXform, f.sx, f.sy, f.tx, f.ty);
    gl.uniform2f(u.uShadow, f.shadowRx, f.shadowOpacity);
    gl.uniform3f(u.uColor, ...rgb(f.color));
    const n = Math.min(MAX_SWIRLS, f.swirls.length);
    // newest swirls last so they paint on top
    const sw = f.swirls.slice(-n);
    sw.forEach((s, i) => {
      this.swirlBuf.set([s.rot, s.scale, s.opacity, 0], i * 4);
      this.swirlColBuf.set(rgb(s.color), i * 3);
    });
    gl.uniform1i(u.uSwirlN, n);
    gl.uniform4fv(u.uSwirl, this.swirlBuf);
    gl.uniform3fv(u.uSwirlColor, this.swirlColBuf);
    gl.uniform2f(u.uLook, f.look.x, f.look.y);
    gl.uniform1f(u.uBlink, Math.max(0.08, f.blink));
    gl.uniform1i(u.uMood, MOODS.indexOf(f.mood));
    gl.uniform1i(u.uFace, this.withFace && f.face ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy() {
    this.ro.disconnect();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
