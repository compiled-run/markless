import { box } from '@async/witness';

const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'live-feed ssr: settled, streamed, rejected, and resumed witnesses stay distinct',
		tags: ['live-feed', 'ssr', 'preview', 'browser', 'async', 'repeat', 'streaming'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({ ...config, configFile: 'boxes/vite.config.ts', mode: 'ssr' }),
		});
		const preview = await pipeline.preview(build);

		// Settled SSR is its own scenario: fast request-time data is already in
		// the response, and loading that response executes no app/component JS.
		const settledHtml = await preview.request('/?latency=0');
		await expect.html.contains(settledHtml, 'data-feed-settled');
		await expect.html.contains(settledHtml, 'data-row-key="atlas-204"');
		if (settledHtml.includes('data-feed-pending')) {
			throw new Error('Expected the fast SSR response to settle before the shell flush.');
		}
		const settledPage = await preview.browser.visit('/?latency=0');
		await expect.page.attribute(settledPage, '[data-update-list]', 'data-row-count', '3', WAIT);
		await expect.page.text(settledPage, '[data-weighted-count]', 'Weighted count 6', WAIT);
		await waitForSettledLoadAccounting(settledPage, WAIT);

		await settledPage.click('[data-row-key="beacon-118"]', WAIT);
		// Regression pin: settled-arm keyed-repeat rows register their event records.
		await expect.page.text(settledPage, '[data-selected-key]', 'Selected beacon-118', WAIT);
		await settledPage.click('[data-increase-weight]', WAIT);
		await expect.page.attribute(settledPage, '[data-weight]', 'data-weight', '3', WAIT);
		// Regression pin: the settled arm's child computed stays connected after commit.
		await expect.page.text(settledPage, '[data-weighted-count]', 'Weighted count 9', WAIT);

		// Raw response timing is deliberately separate from painted-DOM checks:
		// pending can flush in the stream without the browser ever painting it.
		const held = await inspectHeldStream(new URL('/?latency=900', preview.url));
		if (!held.firstChunk.includes('data-feed-pending')) {
			throw new Error('Expected held SSR raw stream to flush the pending arm first.');
		}
		if (!held.firstChunk.includes('data-markless-self-wake')) {
			throw new Error('Expected held SSR raw stream to carry the self-wake marker.');
		}
		if (held.firstChunkElapsedMs >= held.totalElapsedMs) {
			throw new Error('Expected a distinct pending flush before held SSR completion.');
		}
		receipt.note(
			`held pending raw-stream scenario: first=${held.firstChunkElapsedMs}ms total=${held.totalElapsedMs}ms`,
		);

		const heldPage = await preview.browser.visit('/?latency=900');
		await expect.page.attribute(heldPage, '[data-update-list]', 'data-row-count', '3', WAIT);
		const heldStartupScripts = (await heldPage.networkRequests())
			.map((request) => new URL(request.url).pathname)
			.filter((path) => path.startsWith('/build/') && path.endsWith('.js'));
		if (heldStartupScripts.length === 0) {
			throw new Error(
				'Expected held SSR self-wake to request resume JavaScript before interaction.',
			);
		}
		receipt.note(`held pending self-wake startup JS: ${heldStartupScripts.join(', ')}`);

		const rejectedHtml = await preview.request('/?latency=0&fail=1');
		await expect.html.contains(rejectedHtml, 'data-feed-error');
		const rejectedPage = await preview.browser.visit('/?latency=0&fail=1');
		await expect.page.text(
			rejectedPage,
			'[data-feed-error]',
			'Local updates unavailable',
			WAIT,
		);

		await expect.page.outcome(settledPage, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await expect.page.outcome(heldPage, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await expect.page.outcome(rejectedPage, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await preview.close();
		await receipt.capture(
			'live-feed ssr settled lazily, streamed pending with self-wake, rejected, and resumed interactions',
		);
	},
);

type ContentPage = { content(): Promise<string> };

async function waitForSettledLoadAccounting(
	page: ContentPage,
	options: { readonly timeoutMs: number },
): Promise<void> {
	const started = Date.now();
	while (Date.now() - started < options.timeoutMs) {
		const html = await page.content();
		if (
			/data-markless-log-summary="markless: resumed — 0\.0 KB app executed, \d+ modules preloaded \(0 app executed\) · 0\.0 KB instrument"/.test(
				html,
			) &&
			/data-markless-log-app-bytes="0"/.test(html) &&
			/data-markless-log-instrument-bytes="0"/.test(html)
		) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error('Expected settled SSR load accounting to report zero app/component execution.');
}

async function inspectHeldStream(url: URL): Promise<{
	readonly firstChunk: string;
	readonly firstChunkElapsedMs: number;
	readonly totalElapsedMs: number;
}> {
	const started = Date.now();
	const response = await fetch(url);
	if (!response.ok || !response.body) {
		throw new Error(`Expected held SSR stream response, got HTTP ${response.status}.`);
	}
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const first = await reader.read();
	const firstChunkElapsedMs = Date.now() - started;
	let firstChunk = first.value ? decoder.decode(first.value, { stream: !first.done }) : '';
	while (!first.done && !firstChunk.includes('data-feed-pending')) {
		const next = await reader.read();
		if (next.done) break;
		firstChunk += decoder.decode(next.value, { stream: true });
	}
	for (;;) {
		const next = await reader.read();
		if (next.done) break;
	}
	return { firstChunk, firstChunkElapsedMs, totalElapsedMs: Date.now() - started };
}
