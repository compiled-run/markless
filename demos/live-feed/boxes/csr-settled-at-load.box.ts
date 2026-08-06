import { box } from '@async/witness';

// Product truth: the first-time visitor's page. The settle boot fills the arm
// from the fill plan at load, so nothing about the feed is pending by the time a
// gesture lands — and the FIRST gesture is `Increase weight`, not a row click.
// That order is what the arm-record matrix never reached (both reachable CSR
// cells either click a row first or click while the arm is still pending), and
// it is where the defect lived: the weight button's trigger group owned
// `state:weight` and nothing inside the arm, so the click moved `data-weight`
// while `weightedCount` — which lives in the UpdateSummary child, inside the arm
// — never moved, and the later row click matched no group at all and forked a
// second runtime off the raw prerender records (weight back to its initial 2).
const WEIGHT_BUTTON = '[data-increase-weight]';
const WEIGHT_HOST = '[data-weight]';
const WEIGHTED_COUNT = '[data-weighted-count]';
const SELECTED_KEY = '[data-selected-key]';
const UPDATE_LIST = '[data-update-list]';
const ROW_KEYS = ['atlas-204', 'beacon-118', 'cinder-73'] as const;
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'live-feed csr: a page settled at load stays one runtime under any gesture order',
		tags: ['live-feed', 'csr', 'preview', 'browser', 'async', 'repeat', 'prerender'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({ ...config, configFile: 'boxes/vite.config.ts' }),
		});
		const preview = await pipeline.preview(build);
		try {
			const page = await preview.browser.visit('/?latency=0');

			// Load truth: three rows, in feed order, with their keys and their text.
			await expect.page.attribute(page, UPDATE_LIST, 'data-row-count', '3', WAIT);
			for (const key of ROW_KEYS) await expect.page.exists(page, row(key), WAIT);
			await expect.page.text(page, `${row('atlas-204')} strong`, 'Atlas compiler', WAIT);
			await expect.page.text(page, `${row('atlas-204')} [data-version]`, '2.0.4', WAIT);
			await expect.page.text(page, `${row('beacon-118')} strong`, 'Beacon runtime', WAIT);
			await expect.page.text(page, `${row('beacon-118')} [data-version]`, '1.1.8', WAIT);
			await expect.page.text(page, `${row('cinder-73')} strong`, 'Cinder tools', WAIT);
			await expect.page.text(page, `${row('cinder-73')} [data-version]`, '0.7.3', WAIT);
			await expect.page.text(page, '[data-feed-channel]', 'Local build updates', WAIT);
			await expect.page.attribute(page, WEIGHT_HOST, 'data-weight', '2', WAIT);
			await expect.page.text(page, WEIGHTED_COUNT, 'Weighted count 6', WAIT);
			await expect.page.text(page, SELECTED_KEY, 'Selected none', WAIT);

			// Increase weight FIRST: both the attribute outside the arm and the
			// derived text inside it move, on the same click.
			await page.click(WEIGHT_BUTTON, WAIT);
			await expect.page.attribute(page, WEIGHT_HOST, 'data-weight', '3', WAIT);
			await expect.page.text(page, WEIGHTED_COUNT, 'Weighted count 9', WAIT);
			await page.click(WEIGHT_BUTTON, WAIT);
			await expect.page.attribute(page, WEIGHT_HOST, 'data-weight', '4', WAIT);
			await expect.page.text(page, WEIGHTED_COUNT, 'Weighted count 12', WAIT);

			// A row click after those writes selects the row and — the fork pin —
			// leaves the weight the earlier clicks reached. A second runtime built
			// from the prerender records would restore the initial 2 and the next
			// click would read 3, not 5.
			await page.click(row('beacon-118'), WAIT);
			await expect.page.text(page, SELECTED_KEY, 'Selected beacon-118', WAIT);
			await expect.page.attribute(page, WEIGHT_HOST, 'data-weight', '4', WAIT);
			await expect.page.text(page, WEIGHTED_COUNT, 'Weighted count 12', WAIT);
			await page.click(WEIGHT_BUTTON, WAIT);
			await expect.page.attribute(page, WEIGHT_HOST, 'data-weight', '5', WAIT);
			await expect.page.text(page, WEIGHTED_COUNT, 'Weighted count 15', WAIT);
			await expect.page.text(page, SELECTED_KEY, 'Selected beacon-118', WAIT);

			await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
			receipt.note('weight-first gesture order: 2 -> 3 -> 4 -> row -> 5, no fork');

			// The failure arm is the same page's other outcome.
			const failed = await preview.browser.visit('/?latency=0&fail=1');
			await expect.page.text(failed, '[data-feed-error]', 'Local updates unavailable', WAIT);
			await expect.page.outcome(failed, { consoleErrors: 0 }, WAIT);
		} finally {
			await preview.close();
		}

		await receipt.capture('live-feed CSR settled-at-load weight-first gesture order');
	},
);

function row(key: string): string {
	return `[data-row-key="${key}"]`;
}
