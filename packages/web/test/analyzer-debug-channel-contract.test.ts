import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { checkAnalyzerDebugChannelContract, createVerdictReport } from '@markless/analyzer';
import { afterEach, expect, test } from 'vitest';
import { resolveReceiptIdentityValue } from '../../analyzer/test-support/receipt-set.ts';
import {
	__marklessDebugResetForTest,
	__marklessDebugBootstrapSource,
	__marklessDebugChannelForTest,
} from '../src/debug-channel.ts';

afterEach(() => __marklessDebugResetForTest());

test('a missing debug channel fails the analyzer contract', () => {
	expect(checkAnalyzerDebugChannelContract(undefined)).toEqual({
		id: 'MLA-EXT-DEBUG-CHANNEL-CONTRACT',
		status: 'fail',
		details: [
			'MLA-EXT-DEBUG-CHANNEL-CONTRACT: expected debug channel version 1; received missing',
		],
	});
});

test('a version-mismatched real channel fails the analyzer contract', () => {
	const root = {
		isConnected: true,
		contains(candidate: unknown) {
			return candidate === this;
		},
	};
	const install = new Function(`return ${__marklessDebugBootstrapSource()}`)();
	install(root, 'csr', true);
	const emitted = __marklessDebugChannelForTest() as { version: number };
	const mismatched = { ...emitted, version: 2 };
	expect(checkAnalyzerDebugChannelContract(mismatched).status).toBe('fail');
	expect(checkAnalyzerDebugChannelContract(mismatched).details[0]).toContain('received 2');
});

test('the real emitted debug channel satisfies the analyzer contract', async () => {
	const root = {
		isConnected: true,
		contains(candidate: unknown) {
			return candidate === this;
		},
	};
	const install = new Function(`return ${__marklessDebugBootstrapSource()}`)();
	install(root, 'csr', true);
	const emitted = __marklessDebugChannelForTest();
	const result = checkAnalyzerDebugChannelContract(emitted);
	expect(result).toEqual({
		id: 'MLA-EXT-DEBUG-CHANNEL-CONTRACT',
		status: 'pass',
		details: [
			'The emitted web debug channel provides the analyzer-required version 1 surface.',
		],
	});

	const repositoryRoot = resolve(import.meta.dirname, '../../..');
	const receipt = createVerdictReport({
		source: '@markless/web',
		lane: 'analyzer-debug-channel-contract',
		results: [result],
		metadata: {
			consumer: '@markless/web',
			fixture: 'real-emitted-debug-channel-v1',
			commitSha: await resolveReceiptIdentityValue('git:HEAD', repositoryRoot),
			buildArtifactHash: await resolveReceiptIdentityValue(
				'sha256:packages/web/src/debug-channel.ts',
				repositoryRoot,
			),
		},
	});
	const receiptPath = resolve(
		repositoryRoot,
		'packages/web/.witness/receipts/analyzer-debug-channel-contract.json',
	);
	await mkdir(dirname(receiptPath), { recursive: true });
	await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
});
