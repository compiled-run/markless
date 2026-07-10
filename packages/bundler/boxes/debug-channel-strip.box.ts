import { mkdir, writeFile } from 'node:fs/promises';
import { box } from '@async/witness';
import { DEBUG_CHANNEL_SENTINELS } from '../../analyzer/src/strip-guarantee.ts';
import {
	buildFixture,
	debugChannelReporter,
	expectedDebugResult,
	previewFixture,
} from './debug-channel-positive.box.ts';

const FIXTURES = ['fixtures/vite-csr', 'fixtures/vite-ssr'] as const;
export default box(
	{
		name: 'debug channel: unflagged client and SSR output strips all instrumentation',
		tags: ['debug-channel', 'build', 'preview'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const moduleRows: Array<{ id: string; renderedLength: number }> = [];
		const results: Record<string, unknown> = {};
		for (const fixture of FIXTURES) {
			const build = await pipeline.build({
				config: (config) => ({
					...config,
					root: `${config.root}/${fixture}`,
					configFile: `${config.root}/${fixture}/vite.config.ts`,
					plugins: [
						...(config.plugins ?? []),
						outputModuleObserver(moduleRows),
						debugChannelReporter(false),
					],
				}),
			});
			for (const artifact of build.artifacts) {
				if (!/\.(?:html|[cm]?js)$/.test(artifact.path)) continue;
				assertNoSentinels((await build.artifact(artifact.path)).text, artifact.path);
			}
			const preview = await previewFixture(pipeline, build, fixture, false);
			const html = await preview.request('/');
			assertNoSentinels(html, `${fixture} preview HTML`);
			const page = await preview.browser.visit('/');
			await expect.page.text(page, '[data-counter]', '0', { timeoutMs: 10_000 });
			await expect.page.attribute(page, 'html', 'data-markless-debug-absent', 'true');
			results[fixture] = { artifacts: build.artifacts.length, runtimeAbsent: true };
			await preview.close();

			const flagged = await buildFixture(pipeline, fixture, true);
			const flaggedPreview = await previewFixture(pipeline, flagged, fixture, true);
			const flaggedPage = await flaggedPreview.browser.visit('/');
			const positive = expectedDebugResult(fixture);
			await expect.page.attribute(flaggedPage, 'html', 'data-markless-debug', positive, {
				timeoutMs: 10_000,
			});
			await flaggedPreview.close();

			const clean = await buildFixture(pipeline, fixture, false);
			const cleanPreview = await previewFixture(pipeline, clean, fixture, false);
			const cleanPage = await cleanPreview.browser.visit('/');
			await expect.page.text(cleanPage, '[data-counter]', '0', { timeoutMs: 10_000 });
			await expect.page.attribute(cleanPage, 'html', 'data-markless-debug-absent', 'true');
			await cleanPreview.close();
			results[fixture] = { ...(results[fixture] as object), positive, cleanRemoved: true };
		}
		for (const row of moduleRows) {
			if (row.renderedLength !== 0)
				throw new Error(
					`Expected debug helper ${row.id} to render 0 bytes, saw ${row.renderedLength}`,
				);
		}
		const receiptDirectory = new URL('../.witness/receipts/', import.meta.url);
		await mkdir(receiptDirectory, { recursive: true });
		await writeFile(
			new URL('debug-channel-strip.json', receiptDirectory),
			`${JSON.stringify({ version: 1, results, debugModules: moduleRows }, null, '\t')}\n`,
		);
		receipt.note(
			`Observed ${moduleRows.length} debug helper module metadata rows; all stripped.`,
		);
		await receipt.capture('unflagged CSR and SSR debug channel strip proof');
	},
);

function outputModuleObserver(rows: Array<{ id: string; renderedLength: number }>) {
	return {
		name: 'test:debug-channel-output-modules',
		generateBundle(_options: unknown, bundle: Record<string, unknown>) {
			for (const output of Object.values(bundle)) {
				if (!output || typeof output !== 'object' || !('modules' in output)) continue;
				for (const [id, metadata] of Object.entries(
					(output as { modules: Record<string, { renderedLength?: number }> }).modules,
				)) {
					if (/(?:^|[/\\])debug-channel\.ts(?:[?#].*)?$/.test(id))
						rows.push({ id, renderedLength: metadata.renderedLength ?? 0 });
				}
			}
		},
	};
}

function assertNoSentinels(source: string, label: string): void {
	const found = DEBUG_CHANNEL_SENTINELS.filter((sentinel) => source.includes(sentinel));
	if (found.length > 0) throw new Error(`${label} retained debug sentinels: ${found.join(', ')}`);
}
