import { DEBUG_CHANNEL_SENTINELS } from '@markless/analyzer';
import { describe, expect, test } from 'vitest';
import {
	createBundlerAnalyzerReport,
	evaluateBundlerPreloadWindow,
	evaluateBundlerStrip,
	evaluateDeclaredRequests,
	formatI5Measurement,
	measureAndRefuseI5,
	refuseAfterI5Measurement,
	proveBudgetRedAtMeasuredBytesMinusOne,
	requirePassingAnalyzerResults,
	requireRatifiedBudget,
} from '../boxes/analyzer-gate.ts';
import { bundlerAnalyzerPolicy } from '../boxes/analyzer/policy.ts';

describe('bundler analyzer adoption gate fault controls', () => {
	test('S4 fails in both directions without copying analyzer sentinels', () => {
		const sentinel = evaluateBundlerStrip({ debugEnabled: true, artifacts: [] }).details[0];
		expect(sentinel).toContain('positive control failed');
		expect(
			evaluateBundlerStrip({
				debugEnabled: false,
				artifacts: [{ path: 'client.js', content: DEBUG_CHANNEL_SENTINELS[0] }],
			}),
		).toMatchObject({ status: 'fail', id: 'MLA-S4-STRIP-GUARANTEE' });
	});

	test('creates a schema-valid receipt and makes a forced Witness failure red', () => {
		const report = createBundlerAnalyzerReport({
			identity: { fixture: 'vite-csr-preloader' },
			commitSha: 'abc123',
			buildArtifactHash: 'deadbeef',
			results: [
				{ id: 'MLA-S1-PRELOAD-INTEGRITY', status: 'pass', details: [] },
				{ id: 'MLA-EXT-WITNESS', status: 'fail', details: ['forced box failure'] },
			],
		});
		expect(report).toMatchObject({
			version: 2,
			passed: false,
			metadata: {
				consumer: '@markless/bundler',
				fixture: 'vite-csr-preloader',
				commitSha: 'abc123',
				buildArtifactHash: 'deadbeef',
			},
		});
	});

	test('declares strict cross-origin, pending, and exception policy', () => {
		expect(bundlerAnalyzerPolicy.pending).toEqual({ allow: false });
		expect(bundlerAnalyzerPolicy.crossOrigin).toEqual({ allow: false });
		expect(bundlerAnalyzerPolicy.exceptions).toEqual([]);
		for (const rules of Object.values(bundlerAnalyzerPolicy.network)) {
			expect(rules.every((rule) => rule.origin === 'fixture')).toBe(true);
		}
	});

	test('the live preload boxes are merge-blocking: any non-pass result throws', () => {
		expect(() =>
			requirePassingAnalyzerResults([
				{ id: 'MLA-S1-PRELOAD-INTEGRITY', status: 'pass', details: [] },
				{
					id: 'MLA-I2-NETWORK',
					status: 'fail',
					details: ['undeclared request: GET https://tracker.test/pixel'],
				},
			]),
		).toThrow(/MLA-I2-NETWORK: undeclared request/);
		expect(() =>
			requirePassingAnalyzerResults([
				{ id: 'MLA-EXT-WITNESS', status: 'pass', details: [] },
			]),
		).not.toThrow();
	});

	test('S1 fails for a module fetched after destination settlement', () => {
		const result = evaluateBundlerPreloadWindow({
			baseUrl: 'https://fixture.test/',
			actionKind: 'navigation',
			expectedDestination: { settledAfterRequestCount: 1 },
			declaredPreloads: [],
			observedRequests: [
				{ phase: 'action', actionId: 'open', url: '/build/destination.js' },
				{ phase: 'action', actionId: 'open', url: '/build/late.js' },
			],
		});
		expect(result.invariant).toMatchObject({ status: 'fail' });
		expect(result.invariant.details[0]).toContain('after navigation destination settled');
	});

	test('I2 fails for undeclared and failed requests', () => {
		const result = evaluateDeclaredRequests({
			pageOrigin: 'https://fixture.test',
			rules: bundlerAnalyzerPolicy.network['vite-csr-preloader'],
			requests: [
				{ method: 'GET', url: 'https://third-party.test/a.js', status: 200 },
				{ method: 'GET', url: 'https://fixture.test/build/app.js', status: 500 },
			],
		});
		expect(result.status).toBe('fail');
		expect(result.details).toEqual([
			'undeclared request: GET https://third-party.test/a.js',
			'failed request: GET https://fixture.test/build/app.js (500)',
		]);
	});

	test('I5 fails at measuredBytes - 1 and refuses unratified placeholders', () => {
		expect(proveBudgetRedAtMeasuredBytesMinusOne('bootstrap', 101)).toMatchObject({
			status: 'fail',
			details: ['101 executed bytes; QA-build regression ceiling 100'],
		});
		expect(() => requireRatifiedBudget('vite-csr-preloader')).toThrow(
			'MLA-I5 budget placeholder refused',
		);
	});

	test('I5 measurement mode prints one grep-able line and remains red', () => {
		expect(
			formatI5Measurement('vite-csr-preloader', {
				bootstrap: 123,
				action: 45,
			}),
		).toBe('I5-MEASURED vite-csr-preloader bootstrap=123 action=45');

		const lines: string[] = [];
		expect(() =>
			refuseAfterI5Measurement('vite-ssr-preloader', { bootstrap: 987, action: 65 }, (line) =>
				lines.push(line),
			),
		).toThrow('MLA-I5 budget placeholder refused');
		expect(lines).toEqual(['I5-MEASURED vite-ssr-preloader bootstrap=987 action=65']);
	});

	test('I5 measurement finishes both live-page windows before printing and refusing', async () => {
		const events: string[] = [];
		await expect(
			measureAndRefuseI5(
				'vite-csr-preloader',
				async () => {
					events.push('coverage-started');
					await Promise.resolve();
					events.push('coverage-stopped-and-read');
					return { bootstrap: 321, action: 54 };
				},
				(line) => events.push(line),
			),
		).rejects.toThrow('MLA-I5 budget placeholder refused');
		expect(events).toEqual([
			'coverage-started',
			'coverage-stopped-and-read',
			'I5-MEASURED vite-csr-preloader bootstrap=321 action=54',
		]);
	});
});
