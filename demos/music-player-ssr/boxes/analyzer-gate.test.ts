import { readdir, readFile } from 'node:fs/promises';
import {
	assertMatrixFileSetEquality,
	validateMatrixDocument,
	validateVerdictReport,
} from '@markless/analyzer';
import { describe, expect, test } from 'vitest';
import {
	createMusicSsrReport,
	evaluateMusicSsrPreloadWindow,
	evaluateMusicSsrRequests,
} from './analyzer/analyzer-gate.ts';
import { musicSsrAnalyzerPolicy } from './analyzer/policy.ts';

describe('music-player SSR analyzer gate', () => {
	test('validates the route matrix and proves exact pages closure', async () => {
		const matrix = validateMatrixDocument(
			JSON.parse(
				await readFile(
					new URL('./analyzer/route-action-matrix.json', import.meta.url),
					'utf8',
				),
			),
		);
		const pages = (await readdir(new URL('../pages/', import.meta.url)))
			.filter((name) => /\.(?:tsrx|mdx)$/.test(name))
			.map((name) => `pages/${name}`);
		expect(() => assertMatrixFileSetEquality(matrix, pages)).not.toThrow();
		expect(() => assertMatrixFileSetEquality({ ...matrix, routes: [] }, pages)).toThrow(
			/missing=.*index/i,
		);
	});

	test('declares E1 strictness, exact YouTube traffic, and separate Play/Next V8 deferral', () => {
		expect(musicSsrAnalyzerPolicy.pending).toEqual({ allow: false });
		expect(musicSsrAnalyzerPolicy.crossOrigin).toEqual({ allow: false });
		expect(musicSsrAnalyzerPolicy.exceptions).toEqual([]);
		expect(musicSsrAnalyzerPolicy.network).toContainEqual(
			expect.objectContaining({ origin: 'https://www.youtube.com', path: '/iframe_api' }),
		);
		expect(musicSsrAnalyzerPolicy.executedBytes.enforcementDeferred).toMatch(
			/separate Play and Next/,
		);
	});

	test('S1 action module and I2 undeclared/failed requests turn red', () => {
		expect(
			evaluateMusicSsrPreloadWindow({
				baseUrl: 'https://fixture.test/',
				actionKind: 'interaction',
				declaredPreloads: [],
				observedRequests: [{ phase: 'action', actionId: 'play', url: '/build/late.js' }],
			}).invariant.status,
		).toBe('fail');
		const result = evaluateMusicSsrRequests({
			pageOrigin: 'https://fixture.test',
			rules: musicSsrAnalyzerPolicy.network,
			requests: [
				{ method: 'GET', url: 'https://tracker.test/x', status: 200 },
				{
					method: 'GET',
					url: 'https://fixture.test/build/app.js',
					status: null,
					failedReason: 'reset',
				},
			],
		});
		expect(result.status).toBe('fail');
		expect(result.details).toHaveLength(2);
	});

	test('failed and malformed receipts turn red', () => {
		expect(
			createMusicSsrReport([{ id: 'MLA-EXT-WITNESS', status: 'fail', details: ['forced'] }])
				.passed,
		).toBe(false);
		expect(() => validateVerdictReport({ version: 2, passed: true })).toThrow(
			/schema violation/,
		);
	});
});
