// Hand-tuned stroke icons, 24×24, drawn in currentColor.

const wrap = (body: string, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const icon = {
  back: wrap('<path d="M15 5l-7 7 7 7"/>'),
  next: wrap('<path d="M9 5l7 7-7 7"/>'),
  home: wrap('<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>'),
  soundOn: wrap(
    '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>',
  ),
  soundOff: wrap('<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  undo: wrap('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  pour: wrap(
    '<path d="M5 7l3 13h8l3-13"/><path d="M3.5 7h17"/><path d="M9 3.5c1 .8 2 .8 3 0s2-.8 3 0"/>',
  ),
  bulb: wrap(
    '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  ),
  replay: wrap('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>'),
  lock: wrap('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  play: wrap('<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>'),
  sparkle: wrap(
    '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor"/><path d="M19 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="currentColor"/>',
  ),
  palette: wrap(
    '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-2 0-.6-.3-1-.6-1.4-.3-.4-.6-.8-.6-1.4 0-1.1.9-2 2-2h2.3A4.9 4.9 0 0 0 21 9.3C21 5.8 17 3 12 3z"/><circle cx="7.5" cy="11.5" r="1.3" fill="currentColor"/><circle cx="10" cy="7.2" r="1.3" fill="currentColor"/><circle cx="15" cy="7.2" r="1.3" fill="currentColor"/>',
  ),
  book: wrap(
    '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  ),
  star: wrap('<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/>'),
  check: wrap('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  install: wrap('<path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/>'),
};

/** Chunky outlined star used for level ratings. */
export function starSVG(filled: boolean) {
  return `<svg viewBox="0 0 48 48" aria-hidden="true" class="star ${filled ? 'is-on' : ''}">
    <path d="M24 4.5l5.9 12.2 13.4 1.7-9.8 9.3 2.5 13.3L24 34.6 12 41l2.5-13.3-9.8-9.3 13.4-1.7z"
      stroke-width="4" stroke-linejoin="round"/>
    <path class="star-gloss" d="M17.5 20.5l3.2-.4" stroke-width="3.2" stroke-linecap="round"/>
  </svg>`;
}
