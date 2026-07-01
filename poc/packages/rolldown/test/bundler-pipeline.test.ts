import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { createMarklessRolldownPlugin } from '../src/index.ts';

const fixturePath = 'fixtures/proofs/bundler-pipeline/src/App.tsrx';

async function readFixture(): Promise<string> {
	const fixtureUrl = new URL(`../../../${fixturePath}`, import.meta.url);
	return await readFile(fixtureUrl, 'utf8');
}

test('Rolldown POC plugin sees TSRX, delegates transform, and exposes virtual modules', async () => {
	const source = await readFixture();
	const plugin = createMarklessRolldownPlugin();
	const result = await plugin.transform(source, fixturePath);

	expect(result).toEqual(
		expect.objectContaining({
			moduleId: fixturePath,
			code: expect.stringContaining('markless TSRX transform'),
		}),
	);
	expect(plugin.manifest().transformedModules).toEqual([
		expect.objectContaining({ id: fixturePath, sourceKind: 'tsrx' }),
	]);
	expect(plugin.manifest().virtualModules.map((module) => module.kind)).toEqual([
		'symbol-resolver',
		'manifest',
		'runtime-entry',
	]);
	expect(plugin.manifest().emittedChunks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ kind: 'app', owner: 'app-module' }),
			expect.objectContaining({ kind: 'symbol', owner: 'generated-symbol-resolver' }),
			expect.objectContaining({ kind: 'runtime', owner: 'runtime-resume-entry' }),
		]),
	);

	const symbolModule = plugin
		.manifest()
		.virtualModules.find((module) => module.kind === 'symbol-resolver');
	expect(symbolModule).toBeDefined();
	expect(await plugin.load(symbolModule?.id ?? '')).toContain('loadSymbol');

	expect(plugin.receipts()).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				stage: 'rolldown-transform',
				moduleId: fixturePath,
				inspectable: true,
			}),
			expect.objectContaining({
				stage: 'virtual-module-load',
				moduleId: symbolModule?.id,
				inspectable: true,
			}),
		]),
	);
});
