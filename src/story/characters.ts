// The story's characters, drawn in the game's ink-outlined style: Кляксын,
// the villain who steals the colors, and the hedgehog who asks for help.

const INK = '#2B2340';

/** Кляксын: an inky blob with angry brows, a toothy grin and drips. */
export function villainSVG() {
  return `<svg viewBox="0 0 240 230" class="story-svg" aria-hidden="true">
    <ellipse cx="120" cy="218" rx="86" ry="9" fill="${INK}" opacity=".18"/>
    <path d="M42 176C10 156 12 94 46 64C74 30 152 20 192 52C230 82 232 146 202 174C210 182 212 202 198 204C188 205 186 194 184 186C168 194 150 196 132 196C132 212 124 220 114 218C104 215 106 204 106 196C84 196 64 192 50 186C46 196 30 198 28 188C27 180 36 178 42 176Z"
      fill="#2A2238" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M58 96C62 74 80 56 104 50" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".18"/>
    <ellipse cx="90" cy="104" rx="22" ry="25" fill="#FFF7D6" stroke="${INK}" stroke-width="4"/>
    <ellipse cx="152" cy="104" rx="22" ry="25" fill="#FFF7D6" stroke="${INK}" stroke-width="4"/>
    <circle cx="98" cy="110" r="10" fill="#E8273F"/>
    <circle cx="144" cy="110" r="10" fill="#E8273F"/>
    <circle cx="101" cy="106" r="3" fill="#fff"/>
    <circle cx="147" cy="106" r="3" fill="#fff"/>
    <path d="M58 72L112 90M184 72L130 90" fill="none" stroke="#120E1C" stroke-width="11" stroke-linecap="round"/>
    <path d="M74 146Q121 186 168 146Q121 164 74 146Z" fill="#7A1534" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M88 152l7 12 6-10M140 152l-7 12-6-10" fill="#fff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  </svg>`;
}

/** Points of a spiky back: alternating long and short spikes along an arc. */
function spikes(cx: number, cy: number, from: number, to: number, count: number, outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i <= count * 2; i++) {
    const a = ((from + ((to - from) * i) / (count * 2)) * Math.PI) / 180;
    const r = i % 2 ? outer : inner;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return pts;
}

/** The hedgehog, facing right, with an apple on its spikes. */
export function hedgehogSVG() {
  const back = spikes(118, 150, 180, 335, 9, 104, 80);
  const backPath = `M${back[0]}L${back.slice(1).join('L')}Q150 150 118 168Q60 176 ${back[0]}Z`;
  return `<svg viewBox="0 0 270 230" class="story-svg" aria-hidden="true">
    <ellipse cx="140" cy="220" rx="96" ry="8" fill="${INK}" opacity=".16"/>
    <ellipse cx="106" cy="208" rx="18" ry="11" fill="#F6C9A0" stroke="${INK}" stroke-width="5"/>
    <ellipse cx="170" cy="208" rx="18" ry="11" fill="#F6C9A0" stroke="${INK}" stroke-width="5"/>
    <path d="M30 160C30 112 80 92 140 96C200 100 244 128 252 154C244 184 198 206 140 206C80 206 30 196 30 160Z"
      fill="#F6C9A0" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
    <path d="${backPath}" fill="#8A5A3B" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M70 122l14 -18M104 108l8 -22M140 106l2 -22M60 150l-16 -8" stroke="#5E3B24" stroke-width="5" stroke-linecap="round"/>
    <circle cx="96" cy="58" r="20" fill="#E8273F" stroke="${INK}" stroke-width="5"/>
    <path d="M96 38c2 -8 8 -12 16 -12c-2 8 -8 12 -16 12z" fill="#2BAE4C" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M86 50c2 -4 6 -6 10 -6" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>
    <ellipse cx="196" cy="140" rx="9" ry="11" fill="${INK}"/>
    <circle cx="199" cy="136" r="3.4" fill="#fff"/>
    <ellipse cx="204" cy="166" rx="13" ry="8" fill="#FF98A7" opacity=".75"/>
    <circle cx="252" cy="152" r="10" fill="${INK}"/>
    <circle cx="249" cy="148" r="3" fill="#fff" opacity=".8"/>
    <path d="M214 176Q226 186 238 174" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
}
