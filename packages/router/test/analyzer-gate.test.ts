import { readdir, readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { assertMatrixFileSetEquality, validateMatrixDocument } from '@markless/analyzer';
import { describe, expect, test } from 'vitest';
import {
	createRouterAnalyzerReport,
	evaluateRouterPreloadWindow,
	evaluateRouterRequests,
} from '../boxes/analyzer-gate.ts';
import { routerAnalyzerPolicy } from '../boxes/analyzer/policy.ts';

const fixtureRoot = new URL('../fixtures/router/', import.meta.url);
const matrixUrl = new URL('../boxes/analyzer/route-action-matrix.json', import.meta.url);

async function routeFiles(directory = new URL('pages/', fixtureRoot)): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
			return entry.isDirectory()
				? routeFiles(url)
				: /\.(?:tsrx|mdx)$/.test(entry.name)
					? [relative(new URL('.', fixtureRoot).pathname, url.pathname)]
					: [];
		}),
	);
	return files.flat();
}

async function matrix() {
	return validateMatrixDocument(JSON.parse(await readFile(matrixUrl, 'utf8')));
}

describe('router analyzer adoption gate', () => {
	test('validates the C1 matrix and proves exact discovered route closure', async () => {
		const value = await matrix();
		const files = await routeFiles();
		expect(() => assertMatrixFileSetEquality(value, files)).not.toThrow();
	});

	test('route closure turns red when a matrix entry is removed or a route is undeclared', async () => {
		const value = await matrix();
		const files = await routeFiles();
		expect(() =>
			assertMatrixFileSetEquality({ ...value, routes: value.routes.slice(1) }, files),
		).toThrow(/missing=.*404/i);
		expect(() =>
			assertMatrixFileSetEquality(value, [...files, 'pages/undeclared.tsrx']),
		).toThrow(/missing=.*undeclared/i);
	});

	test('declares strict E1 pending, cross-origin, exception, and I5 deferral policy', () => {
		expect(routerAnalyzerPolicy.pending).toEqual({ allow: false });
		expect(routerAnalyzerPolicy.crossOrigin).toEqual({ allow: false });
		expect(routerAnalyzerPolicy.exceptions).toEqual([]);
		expect(routerAnalyzerPolicy.executedBytes.enforcementDeferred).toContain('MDX m0');
	});

	test('I2 turns red for a policy-violating request', () => {
		const result = evaluateRouterRequests({
			pageOrigin: 'https://fixture.test',
			rules: routerAnalyzerPolicy.network.router,
			requests: [
				{ method: 'GET', url: 'https://fixture.test/build/bundle-graph.json', status: 200 },
			],
		});
		expect(result).toMatchObject({ status: 'fail' });
		expect(result.details[0]).toContain('undeclared request');
	});

	test('S1 turns red for a post-settlement navigation chunk', () => {
		const result = evaluateRouterPreloadWindow({
			baseUrl: 'https://fixture.test/',
			actionKind: 'navigation',
			expectedDestination: { settledAfterRequestCount: 1 },
			declaredPreloads: [],
			observedRequests: [
				{ phase: 'action', actionId: 'docs-link', url: '/build/docs.js' },
				{ phase: 'action', actionId: 'docs-link', url: '/build/late.js' },
			],
		});
		expect(result.invariant).toMatchObject({ status: 'fail' });
	});

	test('creates a manifest-identifiable failed receipt when a box result is red', () => {
		const report = createRouterAnalyzerReport({
			identity: { matrix: 'router-route-actions-v1' },
			commitSha: 'abc',
			buildArtifactHash: 'hash',
			results: [{ id: 'MLA-EXT-WITNESS', status: 'fail', details: ['forced failure'] }],
		});
		expect(report).toMatchObject({
			passed: false,
			metadata: { consumer: '@markless/router', matrix: 'router-route-actions-v1' },
		});
	});
});
