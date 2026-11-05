// The values the stencil figure shows, its tour and the sentences its live region speaks.
export const CHILD = 'CartBadge';
export const PROP = 'bags';
export const PAINTS = ['yellow', 'sky', 'mint'] as const;
export type Paint = (typeof PAINTS)[number];
export const nextPaint = (paint: Paint, step = 1): Paint => PAINTS[(PAINTS.indexOf(paint) + step + PAINTS.length) % PAINTS.length]!;
/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
/** Pixels of vertical drag on the pot per paint. */
export const DIAL = 28;
export const STENCIL_TOUR = ['paint', 'rest', 'paint', 'rest', 'paint', 'rest'] as const;

export const describePaint = (paint: Paint) => `${PROP} is now ${paint}. The letters show it at once, and ${CHILD} is the same card.`;
export const REFUSE = `${CHILD} was cut once. It doesn't change; only what shows through it does.`;
