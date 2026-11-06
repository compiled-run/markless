// The coverage figure's numbers and words. The two totals are the README's measured figures for the shadcn/ui docs home page, executed at load.
export const BEFORE_KB = 1403;
export const AFTER_KB = 131;
export const SOURCE = 'https://github.com/compiled-run/markless#migrate-an-existing-app';

export type Side = 'browser' | 'compile';

export const ROWS = {
	browser: [
		{ key: 'runtime', name: 'framework runtime', work: 'the library that runs every component in the browser' },
		{ key: 'render', name: 'components, again', work: 'rebuilding what the server already drew' },
		{ key: 'wire', name: 'event setup', work: 're-running components to attach events' },
	],
	compile: [{ key: 'page', name: 'page code', work: 'only what this page needs before anyone touches it' }],
} as const;

export const CLICK_ROW = { key: 'click', name: 'Get Started handler', work: 'loaded and run on the click, not before' };

export function describeCoverage(side: Side, clicked: boolean): string {
	if (side === 'browser') return `Work done in the browser: ${BEFORE_KB.toLocaleString('en-US')} kB of JavaScript executed at load on the shadcn/ui docs home page.`;
	return `Worked out at compile time: ${AFTER_KB} kB executed at load on the same page.${clicked ? ' The click added one small row: its handler, run only now.' : ''}`;
}
