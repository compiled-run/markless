import { box } from '@async/witness';

// Product truth: a scope-compiled component <style> block ships through Vite's
// CSS pipeline as a virtual .css module and actually styles the served page.
// The fixture reports two facts into DOM status elements: the host element's
// class attribute carries both the authored class and a compiler scope token
// (/^mk-[a-z0-9]+$/), and the scoped rule reached the live document (a
// stylesheet rule whose selector includes `.card.mk-` or a red computed color).
const FIXTURE = 'fixtures/vite-csr-styles';
const HOST = 'section[data-styled-host]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'csr styles dev browser: scoped style css reaches the page',
		tags: ['csr', 'styles', 'dev', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, browser, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		const page = await browser.visit('/');

		await expect.page.exists(page, HOST, WAIT);
		await expect.page.exists(page, '#scope-detail', WAIT);
		receipt.note(`scoped style evidence: ${scopeDetail(await page.content())}`);

		await expect.page.text(page, '#scope-class-status', 'ok', WAIT);
		await expect.page.text(page, '#scoped-css-status', 'ok', WAIT);
		receipt.note(`scoped style evidence after ok: ${scopeDetail(await page.content())}`);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await receipt.capture('scoped style css delivered through vite dev');
	},
);

function scopeDetail(html: string): string {
	const match = /id="scope-detail"[^>]*>([^<]*)</.exec(html);
	return match?.[1]?.trim() || '(scope-detail element not found in page content)';
}
