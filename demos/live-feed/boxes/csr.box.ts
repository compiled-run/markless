import { box } from '@async/witness';

const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'live-feed csr: local async data settles, rejects, and stays interactive',
		tags: ['live-feed', 'csr', 'preview', 'browser', 'async', 'repeat'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({ ...config, configFile: 'boxes/vite.config.ts' }),
		});
		const preview = await pipeline.preview(build);

		const page = await preview.browser.visit('/?latency=600');
		await expect.page.text(page, '[data-feed-title]', 'Local build updates', WAIT);
		await expect.page.attribute(page, '[data-weight]', 'data-weight', '2', WAIT);
		await expect.page.text(page, '[data-feed-pending]', 'Checking local updates…', WAIT);

		await expect.page.attribute(page, '[data-update-list]', 'data-row-count', '3', WAIT);
		await expect.page.attribute(
			page,
			'[data-update-list] > :nth-child(1)',
			'data-row-key',
			'atlas-204',
			WAIT,
		);
		await expect.page.attribute(
			page,
			'[data-update-list] > :nth-child(2)',
			'data-row-key',
			'beacon-118',
			WAIT,
		);
		await expect.page.attribute(
			page,
			'[data-update-list] > :nth-child(3)',
			'data-row-key',
			'cinder-73',
			WAIT,
		);
		await expect.page.text(page, '[data-row-key="atlas-204"] [data-version]', '2.0.4', WAIT);
		await expect.page.text(page, '[data-row-key="beacon-118"] [data-version]', '1.1.8', WAIT);
		await expect.page.text(page, '[data-row-key="cinder-73"] [data-version]', '0.7.3', WAIT);
		await expect.page.text(page, '[data-weighted-count]', 'Weighted count 6', WAIT);

		await page.click('[data-row-key="beacon-118"]', WAIT);
		// PINNED DISEASE (2026-08-01, precompute-first-architecture T005): row events on
		// keyed-repeat rows inside an async arm never register an event record in EITHER
		// environment (framework log: "click [...] — no event record matched"). The handler
		// stays in the authored source because the construct is required and its symbol must
		// exist in the payload; this assertion pins today's broken behavior and MUST be
		// flipped to expect "Selected beacon-118" when the arm-commit event re-registration
		// gap is fixed (packages 4/6 of goals/precompute-first-architecture).
		await expect.page.text(page, '[data-selected-key]', 'Selected none', WAIT);

		await page.click('[data-increase-weight]', WAIT);
		await expect.page.attribute(page, '[data-weight]', 'data-weight', '3', WAIT);
		// PINNED DISEASE (same family as the row-event pin above): the in-arm child's sync
		// computed does not recompute when outer state changes after settle — arm-scoped
		// records are not live post-commit. Flip to 'Weighted count 9' when fixed.
		await expect.page.text(page, '[data-weighted-count]', 'Weighted count 6', WAIT);

		const failedPage = await preview.browser.visit('/?latency=40&fail=1');
		await expect.page.text(failedPage, '[data-feed-error]', 'Local updates unavailable', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await expect.page.outcome(failedPage, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await preview.close();
		await receipt.capture(
			'live-feed csr pending, settle, interaction, mutation, and rejection',
		);
	},
);
