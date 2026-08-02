import { box } from '@async/witness';
import { assertArmRecordCell, reachableArmRecordCells } from './arm-record-cells';

const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'live-feed csr: legacy and prerendered arm-record cells stay interactive',
		tags: ['live-feed', 'csr', 'preview', 'browser', 'async', 'repeat', 'prerender'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		for (const posture of ['csr-legacy', 'prerendered'] as const) {
			const configFile =
				posture === 'csr-legacy'
					? 'boxes/vite.legacy.config.ts'
					: 'boxes/vite.config.ts';
			const build = await pipeline.build({
				config: (config) => ({ ...config, configFile }),
			});
			const preview = await pipeline.preview(build);
			try {
				for (const cell of reachableArmRecordCells('csr').filter(
					(cell) => cell.posture === posture,
				)) {
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
				await expect.page.outcome(
					failedPage,
					{ consoleErrors: 0, failedRequests: 0 },
					WAIT,
				);
			} finally {
				await preview.close();
			}
		}

		await receipt.capture('live-feed CSR arm-record posture and settle-timing matrix');
	},
);
