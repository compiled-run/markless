// The values the key figure shows, and the sentence its live region speaks.
export const GOOD = '/blog/[slug]';
export const TYPO = '/blgo/[slug]';
/** Each try flips the beat, so the try animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export type Tried = 'none' | 'good' | 'typo';
/** How close, in drawing units, a dragged key's tip must come to the lock to be tried. */
export const LOCK_NEAR = 150;

export function describeTry(tried: Tried): string {
	if (tried === 'good') return `The ${GOOD} key turned, and the door opened: that route exists, so the build lets the link through.`;
	if (tried === 'typo') return `The ${TYPO} key would not go in, and slid back: no route matches it, so the build stops.`;
	return '';
}
