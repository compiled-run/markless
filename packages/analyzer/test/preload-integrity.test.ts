import { describe, expect, test } from 'vitest';
import { evaluatePreloadIntegrity } from '../src/preload-integrity.ts';

describe('MLA-S1 preload integrity', () => {
	test('passes when a declared action module was loaded before the interaction', () => {
		const evaluation = evaluatePreloadIntegrity({
			baseUrl: 'https://app.test/dashboard/',
			declaredPreloads: ['/build/editor.js'],
			observedRequests: [
				{
					phase: 'bootstrap',
					url: 'https://app.test/build/editor.js',
					resourceType: 'script',
				},
			],
		});

		expect(evaluation.invariant).toEqual({
			id: 'MLA-S1-PRELOAD-INTEGRITY',
			status: 'pass',
			details: [],
		});
		expect(evaluation.warnings).toEqual([]);
	});

	test('fails an undeclared cold module request with its action', () => {
		const evaluation = evaluatePreloadIntegrity({
			baseUrl: 'https://app.test/',
			actionKind: 'interaction',
			declaredPreloads: [],
			observedRequests: [
				{
					phase: 'action',
					actionId: 'save-settings',
					url: 'https://app.test/build/save.js',
					resourceType: 'script',
				},
			],
		});

		expect(evaluation.invariant.status).toBe('fail');
		expect(evaluation.invariant.details).toEqual([
			'save-settings: module fetched during action without prior preload load: https://app.test/build/save.js',
		]);
	});

	test('reports navigation destination loads without failing preload integrity', () => {
		const evaluation = evaluatePreloadIntegrity({
			baseUrl: 'https://app.test/',
			actionKind: 'navigation',
			expectedDestination: { settledAfterRequestCount: 2 },
			declaredPreloads: [],
			observedRequests: [
				{ phase: 'action', actionId: 'open-alpha', url: '/build/alpha.js' },
				{ phase: 'action', actionId: 'open-alpha', url: '/build/alpha-closure.js' },
			],
		});

		expect(evaluation.invariant.status).toBe('pass');
		expect(evaluation.navigationLoads).toEqual({
			count: 2,
			urls: ['https://app.test/build/alpha.js', 'https://app.test/build/alpha-closure.js'],
		});
	});

	test('fails a navigation module load after the destination settled', () => {
		const evaluation = evaluatePreloadIntegrity({
			baseUrl: 'https://app.test/',
			actionKind: 'navigation',
			expectedDestination: { settledAfterRequestCount: 1 },
			declaredPreloads: [],
			observedRequests: [
				{ phase: 'action', actionId: 'open-alpha', url: '/build/alpha.js' },
				{ phase: 'action', actionId: 'open-alpha', url: '/build/late.js' },
			],
		});

		expect(evaluation.invariant.details).toEqual([
			'open-alpha: module fetched after navigation destination settled: https://app.test/build/late.js',
		]);
		expect(evaluation.navigationLoads).toEqual({
			count: 1,
			urls: ['https://app.test/build/alpha.js'],
		});
	});

	test('fails a declared module that was not loaded before the action', () => {
		const evaluation = evaluatePreloadIntegrity({
			baseUrl: 'https://app.test/',
			declaredPreloads: ['/build/lazy.js'],
			observedRequests: [
				{
					phase: 'action',
					actionId: 'expand-lazy-panel',
					url: '/build/lazy.js',
					resourceType: 'script',
				},
			],
		});

		expect(evaluation.invariant.status).toBe('fail');
		expect(evaluation.warnings).toEqual([]);
	});

	test('reports declared but never loaded preloads as waste warnings', () => {
		const evaluation = evaluatePreloadIntegrity({
			baseUrl: 'https://app.test/',
			declaredPreloads: ['/build/unused.js'],
			observedRequests: [],
		});

		expect(evaluation.invariant.status).toBe('pass');
		expect(evaluation.warnings).toEqual([
			'declared modulepreload was never loaded: https://app.test/build/unused.js',
		]);
	});

	test('normalizes absolute, root-relative, build-relative, and fragment URLs', () => {
		const evaluation = evaluatePreloadIntegrity({
			baseUrl: 'https://app.test/app/index.html',
			actionKind: 'navigation',
			expectedDestination: { settledAfterRequestCount: 1 },
			declaredPreloads: ['../build/chunk.js#declaration'],
			observedRequests: [
				{
					phase: 'navigation',
					url: 'https://app.test/build/chunk.js',
					resourceType: 'script',
				},
				{
					phase: 'action',
					actionId: 'navigate',
					url: '/build/chunk.js',
					resourceType: 'script',
				},
			],
		});

		expect(evaluation.invariant.status).toBe('pass');
		expect(evaluation.warnings).toEqual([]);
	});
});
