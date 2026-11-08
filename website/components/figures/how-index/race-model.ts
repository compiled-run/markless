// The shadcn/ui race: the README's measured numbers for the docs home page, and the sentences the live region speaks.
/** JavaScript executed at load, kB (README "Migrate an existing app" table). */
export const EXEC_KB = { original: 1403, port: 131 } as const;
/** First click answered on a 3G phone, seconds (README: Chromium, both sites on Cloudflare, median of 3 runs, November 2026). */
export const FIRST_CLICK_S = { original: 14.6, port: 3.9 } as const;
/** The race plays at this fraction of real time; the numbers shown stay real. */
export const SPEED = 0.4;
export const LIVE = {
	original: 'https://mm-shadcn-ui-old.long-wildflower-ecf7.workers.dev',
	port: 'https://f136c090-mm-shadcn-ui-new.long-wildflower-ecf7.workers.dev',
} as const;
export const SOURCE = 'https://github.com/compiled-run/markless#migrate-an-existing-app';

export type Side = keyof typeof EXEC_KB;

/** Seconds of the real 3G timeline reached after `ms` of animation. */
export const realSeconds = (ms: number) => (ms / 1000) / SPEED;
export const ready = (side: Side, ms: number) => realSeconds(ms) >= FIRST_CLICK_S[side];
/** How full a side's bar is: its share of the original's executed JS, reached as its page gets ready. */
export const fill = (side: Side, ms: number) => Math.min(1, realSeconds(ms) / FIRST_CLICK_S[side]) * (EXEC_KB[side] / EXEC_KB.original);
export const executedSoFar = (side: Side, ms: number) => Math.round(Math.min(1, realSeconds(ms) / FIRST_CLICK_S[side]) * EXEC_KB[side]);
export const clock = (side: Side, ms: number) => Math.min(realSeconds(ms), FIRST_CLICK_S[side]).toFixed(1) + ' s';

export function describeRace(ms: number, clicked: Readonly<Record<Side, boolean>>): string {
	const t = realSeconds(ms);
	if (ms === 0) return 'Two copies of the shadcn/ui docs home page: the original in Next.js and the Markless port. Press Load on a 3G phone.';
	const parts = [
		ready('port', ms) ? `The Markless port answered its first click at ${FIRST_CLICK_S.port} s after executing ${EXEC_KB.port} kB of JavaScript at load.` : '',
		ready('original', ms) ? `The original answered at ${FIRST_CLICK_S.original} s after executing ${EXEC_KB.original.toLocaleString('en-US')} kB.` : `The original is still loading at ${t.toFixed(1)} s.`,
		clicked.port ? 'Get Started on the port loaded just one small chunk.' : '',
	];
	return parts.filter(Boolean).join(' ');
}
