// The pages the migrate figure moves, the press, the tour and the sentence the live region speaks.
export type Kind = 'home' | 'pricing' | 'account' | 'blog';

export interface Page {
	readonly path: string;
	readonly kind: Kind;
	/** Which press moves it: 0 moves first. */
	readonly rank: number;
	/** The agent's first version is missing something the check catches before the page goes live. */
	readonly miss: string;
}

/** Left to right on the front door; the rightmost moves first so the moved wires never cross the waiting ones. */
export const PAGES: readonly Page[] = [
	{ path: '/', kind: 'home', rank: 3, miss: '' },
	{ path: '/pricing', kind: 'pricing', rank: 2, miss: '' },
	{ path: '/account', kind: 'account', rank: 1, miss: 'settings button' },
	{ path: '/blog', kind: 'blog', rank: 0, miss: '' },
];
export const SITE = 'beanshop.dev';
export const OLD = 'Old app';
export const NEW = 'New app';
export const TAG = 'JS at load';
export const NOTE = 'LIVE ONLY WHEN IT MATCHES';

export const pageAt = (rank: number) => PAGES.find((p) => p.rank === rank)!;

/** One press moves the next page; after the last, a press puts every page back on the old app. */
export const move = (moved: number) => (moved >= PAGES.length ? 0 : moved + 1);
export const buttonLabel = (moved: number) => (moved >= PAGES.length ? 'Start over' : 'Move a page');

export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

export function describe(moved: number, pressed = false): string {
	if (moved === 0) return pressed ? 'Every page goes to the old app again.' : `Every page of ${SITE} goes to the old app. Press to move the next page.`;
	const page = pageAt(moved - 1);
	const count = `${moved} of ${PAGES.length} pages now go to the new app.`;
	if (page.miss) return `The check caught that the new ${page.path} was missing its ${page.miss}. Once it was fixed every part matched, so the front door now sends ${page.path} to the new app. ${count}`;
	return `The new ${page.path} matched the old one part for part, so the front door now sends ${page.path} to the new app. ${count}`;
}

/** The idle tour: move every page, rest, then start over. */
export const TOUR = ['move', 'move', 'move', 'move', 'rest', 'reset'] as const;
export const TOUR_MS = 5200;
