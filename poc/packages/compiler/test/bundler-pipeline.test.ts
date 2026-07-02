import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { transformTsrxForBundler } from '../src/index.ts';

const fixturePath = 'fixtures/proofs/bundler-pipeline/src/App.tsrx';

async function readFixture(): Promise<string> {
	const fixtureUrl = new URL(`../../../${fixturePath}`, import.meta.url);
	return await readFile(fixtureUrl, 'utf8');
}

test('bundler-pipeline fixture produces a compiler transform artifact', async () => {
	const source = await readFixture();
	const artifact = await transformTsrxForBundler({
		filename: fixturePath,
		source,
	});

	expect(artifact.passId).toBe('bundler-pipeline-transform');
	expect(artifact.filename).toBe(fixturePath);
	expect(artifact.sourceKind).toBe('tsrx');
	expect(artifact.transformedModule.id).toBe(fixturePath);
	expect(artifact.transformedModule.code).toContain('markless TSRX transform');
	expect(artifact.transformedModule.code).toContain('virtual:markless/runtime');
	expect(artifact.transformedModule.code).toContain('virtual:markless/symbol-resolver');

	expect(artifact.virtualModules.map((module) => module.kind)).toEqual([
		'symbol-resolver',
		'manifest',
		'runtime-entry',
	]);
	expect(artifact.emittedChunks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ kind: 'app', owner: 'app-module' }),
			expect.objectContaining({ kind: 'symbol', owner: 'generated-symbol-resolver' }),
			expect.objectContaining({ kind: 'runtime', owner: 'runtime-resume-entry' }),
		]),
	);
	expect(artifact.manifest.transformedModules).toEqual([
		expect.objectContaining({
			id: fixturePath,
			sourceKind: 'tsrx',
			virtualModuleIds: artifact.virtualModules.map((module) => module.id),
		}),
	]);
	expect(artifact.manifest.relationships).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				from: fixturePath,
				to: expect.stringContaining('symbol-resolver'),
				relationship: 'owns-symbols',
			}),
			expect.objectContaining({
				from: fixturePath,
				to: expect.stringContaining('runtime'),
				relationship: 'uses-runtime',
			}),
		]),
	);
	expect(artifact.pipelineReceipts).toEqual([
		expect.objectContaining({
			stage: 'compiler-transform',
			moduleId: fixturePath,
			inspectable: true,
		}),
	]);
	expect(artifact.constraints).toMatchObject({
		usesHydration: false,
		usesVdom: false,
		sharedCodeUsesNodeApis: false,
	});
});
