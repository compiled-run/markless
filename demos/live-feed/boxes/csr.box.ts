import { box } from '@async/witness';
import { assertArmRecordCell, reachableArmRecordCells } from './arm-record-cells';

const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'live-feed csr: prerendered arm-record cells stay interactive',
		tags: ['live-feed', 'csr', 'preview', 'browser', 'async', 'repeat', 'prerender'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		// The former non-prerendered CSR cells are dead posture: the legacy
		// full-resume renderArm chain no longer exists. This compiled build uses
		// the self-wake trigger group and its child symbol routes for both arm
		// settlement and the handlers registered from the settled arm.
		const build = await pipeline.build({
			config: (config) => ({ ...config, configFile: 'boxes/vite.config.ts' }),
		});
		const preview = await pipeline.preview(build);
		try {
			for (const cell of reachableArmRecordCells('csr')) {
				const page = await preview.browser.visit(`/?latency=${cell.latencyMs}`);
				await assertArmRecordCell(page, expect, cell);
				receipt.note(`arm-record matrix passed: ${cell.id}`);
			}

			const failedPage = await preview.browser.visit('/?latency=40&fail=1');
			await expect.page.text(
				failedPage,
				'[data-feed-error]',
				'Local updates unavailable',
				WAIT,
			);
			await expect.page.outcome(failedPage, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		} finally {
			await preview.close();
		}

		await receipt.capture('live-feed CSR prerendered arm-record settle-timing matrix');
	},
);
