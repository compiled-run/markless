import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, test } from 'vitest';
import { checkReceiptSet } from '../test-support/receipt-set.ts';

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

const identity = {
	consumer: '@markless/example',
	fixture: 'example-csr',
	commitSha: 'commit-a',
	buildArtifactHash: 'artifact-a',
} as const;

const report = (overrides: Record<string, unknown> = {}) => ({
	version: 2,
	source: 'example',
	lane: 'browser',
	results: [{ id: 'MLA-EXT-EXAMPLE', status: 'pass', details: [] }],
	passed: true,
	metadata: identity,
	...overrides,
});

async function fixture(
	receipts: Record<string, unknown>,
	entries = [{ receiptPath: 'example.json', ...identity }],
) {
	const directory = await mkdtemp(join(tmpdir(), 'markless-receipts-'));
	directories.push(directory);
	await Promise.all(
		Object.entries(receipts).map(([path, value]) =>
			writeFile(
				join(directory, path),
				typeof value === 'string' ? value : JSON.stringify(value),
			),
		),
	);
	const manifest = { entries };
	const manifestPath = join(directory, 'expected-receipts.json');
	await writeFile(manifestPath, JSON.stringify(manifest));
	return { directory, manifest, manifestPath };
}

async function expectRed(input: Awaited<ReturnType<typeof fixture>>, message?: RegExp) {
	await expect(checkReceiptSet(input.manifest, input.directory)).rejects.toThrow(message);
	const result = spawnSync(
		process.execPath,
		[
			join(import.meta.dirname, '../test-support/check-receipts.ts'),
			input.manifestPath,
			input.directory,
		],
		{ encoding: 'utf8' },
	);
	expect(result.status, result.stderr).toBe(1);
}

describe('receipt-set checker', () => {
	test('accepts the complete green expected set', async () => {
		const input = await fixture({ 'example.json': report() });
		expect(await checkReceiptSet(input.manifest, input.directory)).toEqual({ checked: 1 });
	});

	test.each([
		[
			'failed verdict',
			report({
				passed: false,
				results: [{ id: 'MLA-EXT-EXAMPLE', status: 'fail', details: [] }],
			}),
		],
		[
			'unexpected not-run',
			report({
				passed: true,
				results: [{ id: 'MLA-EXT-EXAMPLE', status: 'not-run', details: [] }],
			}),
		],
	])('rejects a %s', async (_name, value) => {
		const input = await fixture({ 'example.json': value });
		await expectRed(input);
	});

	test('rejects a missing receipt', async () => {
		const input = await fixture({});
		await expectRed(input, /example\.json/);
	});

	test.each([
		['malformed JSON', '{'],
		['schema-invalid JSON', report({ version: 99 })],
	])('rejects %s', async (_name, value) => {
		const input = await fixture({ 'example.json': value });
		await expectRed(input);
	});

	test.each([
		['stale commit', { ...identity, commitSha: 'commit-old' }],
		['artifact hash mismatch', { ...identity, buildArtifactHash: 'artifact-old' }],
	])('rejects a %s', async (_name, metadata) => {
		const input = await fixture({ 'example.json': report({ metadata }) });
		await expectRed(input);
	});

	test.each([
		['receipt path', { receiptPath: 'example.json', ...identity }],
		['consumer fixture identity', { receiptPath: 'duplicate.json', ...identity }],
	])('rejects a duplicate %s', async (_name, duplicate) => {
		const input = await fixture({ 'example.json': report(), 'duplicate.json': report() }, [
			{ receiptPath: 'example.json', ...identity },
			duplicate,
		]);
		await expectRed(input, /duplicate/);
	});
});
