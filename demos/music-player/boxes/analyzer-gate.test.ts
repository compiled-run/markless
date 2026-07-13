import { readFile } from 'node:fs/promises';
import { validateVerdictReport } from '@markless/analyzer';
import { describe, expect, test } from 'vitest';
import {
	createMusicCsrReport,
	evaluateMusicCsrPreloadWindow,
	evaluateMusicCsrRequests,
	validateMusicCsrMatrixDocument,
} from './analyzer/analyzer-gate.ts';
import { musicCsrAnalyzerPolicy } from './analyzer/policy.ts';

describe('music-player CSR analyzer gate', () => {
	test('maps every existing box interaction to a typed fixture and canonical surfaces', async () => {
		const matrix = validateMusicCsrMatrixDocument(
			JSON.parse(
				await readFile(
					new URL('./analyzer/route-action-matrix.json', import.meta.url),
					'utf8',
				),
			),
		);
		expect(
			matrix.fixtures.map(({ fixture, interactions }) => ({ fixture, interactions })),
		).toEqual([
			{ fixture: 'csr-command-state', interactions: ['play', 'next-track'] },
			{ fixture: 'csr-play-branch', interactions: ['play', 'pause'] },
		]);
		for (const fixture of matrix.fixtures)
			expect(fixture.surfaces).toEqual([
				'MLA-S1-PRELOAD-INTEGRITY',
				'MLA-I1-CONSOLE',
				'MLA-I2-NETWORK',
				'MLA-I5-BOOTSTRAP-BUDGET',
				'MLA-I5-ACTION-BUDGET',
				'MLA-EXT-WITNESS',
			]);
	});

	test('declares strict E1 policy, an exact YouTube contract, and fresh-V8 deferral', () => {
		expect(musicCsrAnalyzerPolicy.pending).toEqual({ allow: false });
		expect(musicCsrAnalyzerPolicy.crossOrigin).toEqual({ allow: false });
		expect(musicCsrAnalyzerPolicy.exceptions).toEqual([]);
		expect(musicCsrAnalyzerPolicy.network).toContainEqual(
			expect.objectContaining({ origin: 'https://www.youtube.com', path: '/iframe_api' }),
		);
		expect(musicCsrAnalyzerPolicy.executedBytes.enforcementDeferred).toContain('fresh CSR V8');
	});

	test('S1 post-settlement action module and I2 undeclared/failed requests turn red', () => {
		expect(
			evaluateMusicCsrPreloadWindow({
				baseUrl: 'https://fixture.test/',
				actionKind: 'interaction',
				declaredPreloads: [],
				observedRequests: [{ phase: 'action', actionId: 'play', url: '/build/late.js' }],
			}).invariant.status,
		).toBe('fail');
		const network = evaluateMusicCsrRequests({
			pageOrigin: 'https://fixture.test',
			rules: musicCsrAnalyzerPolicy.network,
			requests: [
				{ method: 'GET', url: 'https://tracker.test/pixel', status: 200 },
				{ method: 'GET', url: 'https://fixture.test/build/app.js', status: 500 },
			],
		});
		expect(network.status).toBe('fail');
		expect(network.details).toHaveLength(2);
	});

	test('a failed result makes the receipt red and malformed receipts are rejected', () => {
		expect(
			createMusicCsrReport([{ id: 'MLA-EXT-WITNESS', status: 'fail', details: ['forced'] }])
				.passed,
		).toBe(false);
		expect(() => validateVerdictReport({ version: 2, passed: true })).toThrow(
			/schema violation/,
		);
	});
});
