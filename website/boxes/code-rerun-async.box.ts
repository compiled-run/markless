import { box } from '@async/witness';
import { chromium, expect } from '@playwright/test';

const SLOW_SOURCE = `export function loadMugFact(ms: number) {
	return new Promise<string>((done) => {
		setTimeout(() => done('Lovely and lemony'), ms);
	});
}
`;

const REVIEWS = `import { computed } from '@markless/core';
import { loadMugFact } from './mug-facts.ts';

export default function Reviews() @{
	const text = computed(async () => loadMugFact(1500));

	<section>
		<h2>Reviews</h2>
		@try {
			<p>{text}</p>
		} @pending {
			<p>Loading reviews…</p>
		} @catch {
			<p>Couldn't load them.</p>
		}
	</section>
}
`;

// A run the playground replaced while its async value was still loading must stop, not load code through the run it replaced.
export default box(
	{
		name: 'Code block: re-running while an async value loads reports no error',
		tags: ['website', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, receipt }) => {
		const server = await pipeline.dev({
			config: (config) => ({ ...config, server: { ...config.server, watch: null } }),
		});
		const browser = await chromium.launch({ headless: true });
		const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		await page.addInitScript(() => {
			const failed: string[] = ((globalThis as Record<string, unknown>).__codeFailures = []) as string[];
			addEventListener('message', (event: MessageEvent) => {
				const data = event.data as { type?: string; ok?: boolean; diagnostics?: unknown };
				if (data?.type === 'code:result' && data.ok === false) failed.push(JSON.stringify(data.diagnostics));
			});
		});
		try {
			await page.goto(new URL('/concepts/async', server.url).href);
			const block = page.locator('.code-block').first();
			const runAgain = block.getByRole('button', { name: 'Run again' });
			await runAgain.click();
			const result = page.frameLocator('iframe.code-frame').first();
			await expect(result.locator('body')).toContainText('Tall mug', { timeout: 60_000 });

			await block.getByRole('tab', { name: 'mug-facts.ts', exact: true }).click();
			await block.getByRole('textbox', { name: /^mug-facts\.ts,/ }).fill(SLOW_SOURCE);
			await block.getByRole('tab', { name: 'mug-facts.tsrx', exact: true }).click();
			await block.getByRole('textbox', { name: /^mug-facts\.tsrx,/ }).fill(REVIEWS);
			await expect(result.locator('body')).toContainText('Lovely and lemony', { timeout: 30_000 });

			for (const wait of [300, 400, 500]) {
				await runAgain.click();
				await page.waitForTimeout(wait);
			}
			await expect(result.locator('body')).toContainText('Lovely and lemony', { timeout: 30_000 });
			// Every replaced run's 1.5 s timer has fired by now.
			await page.waitForTimeout(2500);
			const failures = await page.evaluate(
				() => (globalThis as Record<string, unknown>).__codeFailures as string[],
			);
			receipt.note(JSON.stringify({ failures, errors }));
			expect(failures).toEqual([]);
			expect(errors).toEqual([]);
		} finally {
			await browser.close();
		}
	},
);
