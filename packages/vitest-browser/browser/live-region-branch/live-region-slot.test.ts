import { expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import DirectPage from './direct-page.tsrx';
import { quietWatches, watchRegion } from './mutations.ts';

// A text slot inside an aria-live region, on the page shape whose renderer
// re-reads every slot on every gesture: the slot whose value did not move must
// not be rewritten, because the rewrite alone is what a reader announces on.

const el = (testId: string) => document.querySelector(`[data-testid="${testId}"]`) as HTMLElement;

const SILENT = { childList: 0, characterData: 0 };

for (const mode of ['csr', 'ssr'] as const) {
	const lane = mode.toUpperCase();

	test(`${lane}: a text slot whose value did not move is not rewritten`, async () => {
		if (mode === 'csr') await render(DirectPage);
		else await renderSSR(DirectPage);
		await expect.poll(() => el('direct-live')?.textContent).toBe('Taps: 0');
		const live = watchRegion(el('direct-live'));
		try {
			el('direct-idle').click();
			await quietWatches([live]);
			await expect.poll(() => el('direct-aside').textContent).toBe('Aside: 1');
			expect(live.counts()).toEqual(SILENT);

			live.reset();
			el('direct-tap').click();
			await quietWatches([live]);
			expect(el('direct-live').textContent).toBe('Taps: 1');
			expect(live.total()).toBe(1);
		} finally {
			live.stop();
		}
	});
}
