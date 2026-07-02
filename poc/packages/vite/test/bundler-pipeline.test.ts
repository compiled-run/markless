import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { createMarklessVitePlugin } from '../src/index.ts';

const fixturePath = 'fixtures/proofs/bundler-pipeline/src/App.tsrx';

async function readFixture(): Promise<string> {
	const fixtureUrl = new URL(`../../../${fixturePath}`, import.meta.url);
	return await readFile(fixtureUrl, 'utf8');
}

test('Vite POC adapter delegates to Rolldown transform and refreshes HMR artifacts', async () => {
	const source = await readFixture();
	const plugin = createMarklessVitePlugin();

	expect(plugin.markless.compilerModel).toBe('rolldown-base-plugin');
	expect(plugin.markless.usesSecondCompilerModel).toBe(false);

	const result = await plugin.transform(source, fixturePath);
	expect(result).toEqual(
		expect.objectContaining({
			moduleId: fixturePath,
			code: expect.stringContaining('markless TSRX transform'),
		}),
	);

	const before = plugin.markless.manifest();
	const updatedSource = source.replace('pipeline ready', 'pipeline hmr ready');
	const hmr = await plugin.handleHotUpdate({
		file: fixturePath,
		read: async () => updatedSource,
	});
	const after = plugin.markless.manifest();

	expect(hmr).toEqual(
		expect.objectContaining({
			moduleId: fixturePath,
			refreshedManifest: true,
			changedVirtualModules: expect.arrayContaining([
				expect.stringContaining('manifest'),
				expect.stringContaining('symbol-resolver'),
			]),
		}),
	);
	expect(after.revision).toBeGreaterThan(before.revision);
	expect(after.transformedModules[0]?.sourceFingerprint).not.toBe(
		before.transformedModules[0]?.sourceFingerprint,
	);
	expect(plugin.markless.receipts()).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ stage: 'vite-transform', moduleId: fixturePath }),
			expect.objectContaining({ stage: 'hmr-update', moduleId: fixturePath }),
		]),
	);
});
