import { box } from '@async/witness';

const TOGGLE = '[data-toggle-branch]';
const ARM = '[data-child-arm]';
const BEFORE = '[data-sibling-before]';
const AFTER = '[data-sibling-after]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'same-module child branch owns an independent CSR range',
		tags: ['same-module-branch', 'csr', 'preview', 'browser', 'branch'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({ ...config, configFile: 'boxes/vite.config.ts' }),
		});
		const preview = await pipeline.preview(build);
		try {
			const observedSequences: string[][] = [];
			for (let run = 0; run < 2; run++) {
				const page = await preview.browser.visit('/');
				const observed: string[] = [];
				await expect.page.text(page, ARM, 'Quiet arm', WAIT);
				observed.push(await readArmText(page));
				await expect.page.text(page, BEFORE, 'Before child range', WAIT);
				await expect.page.text(page, AFTER, 'After child range', WAIT);

				await page.click(TOGGLE, WAIT);
				await expect.page.text(page, ARM, 'Active arm', WAIT);
				observed.push(await readArmText(page));
				await expect.page.text(page, BEFORE, 'Before child range', WAIT);
				await expect.page.text(page, AFTER, 'After child range', WAIT);

				await page.click(TOGGLE, WAIT);
				await expect.page.text(page, ARM, 'Quiet arm', WAIT);
				observed.push(await readArmText(page));
				await expect.page.text(page, BEFORE, 'Before child range', WAIT);
				await expect.page.text(page, AFTER, 'After child range', WAIT);
				await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
				observedSequences.push(observed);
			}
			if (JSON.stringify(observedSequences[0]) !== JSON.stringify(observedSequences[1])) {
				throw new Error(
					`Expected identical interaction sequences to produce identical observable order, got ${JSON.stringify(observedSequences)}.`,
				);
			}
		} finally {
			await preview.close();
		}

		await receipt.capture(
			'same-module child branch range flipped cleanly twice with deterministic replay order',
		);
	},
);

async function readArmText(page: { content(): Promise<string> }): Promise<string> {
	const text = /<[^>]*\bdata-child-arm\b[^>]*>([^<]*)</.exec(await page.content())?.[1];
	if (text === undefined) throw new Error('Expected the page DOM to contain the child arm.');
	return text;
}
