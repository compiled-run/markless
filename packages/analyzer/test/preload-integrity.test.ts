import { describe, expect, test } from 'vitest';
import { evaluatePreloadIntegrity } from '../src/preload-integrity.ts';

describe('MLA-S1 preload integrity', () => {
	test('passes when a declared action module was loaded before the interaction', () => {
		const evaluation = evaluatePreloadIntegrity({
			baseUrl: 'https://app.test/dashboard/',
			declaredPreloads: ['/assets/editor.js'],
			observedRequests: [
				{
					phase: 'bootstrap',
					url: 'https://app.test/assets/editor.js',
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

	test('fails a bootstrap module load that was not declared up front', () => {
		const evaluation = evaluatePreloadIntegrity({
			baseUrl: 'https://app.test/',
			declaredPreloads: ['/assets/declared.js'],
			observedRequests: [
				{ phase: 'bootstrap', url: '/assets/undeclared.js', resourceType: 'script' },
			],
		});

		expect(evaluation.invariant).toMatchObject({
			status: 'fail',
			details: [
				'undeclared module loaded before interaction: https://app.test/assets/undeclared.js',
			],
		});
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
					url: 'https://app.test/assets/save.js',
					resourceType: 'script',
				},
			],
		});

		expect(evaluation.invariant.status).toBe('fail');
		expect(evaluation.invariant.details).toEqual([
			'save-settings: module fetched during action without prior preload load: https://app.test/assets/save.js',
		]);
	});

	test('reports navigation destination loads without failing preload integrity', () => {
		const evaluation = evaluatePreloadIntegrity({
			baseUrl: 'https://app.test/',
			actionKind: 'navigation',
			expectedDestination: { settledAfterRequestCount: 2 },
			declaredPreloads: [],
			observedRequests: [
				{ phase: 'action', actionId: 'open-alpha', url: '/assets/alpha.js' },
				{ phase: 'action', actionId: 'open-alpha', url: '/assets/alpha-closure.js' },
			],
		});

		expect(evaluation.invariant.status).toBe('pass');
		expect(evaluation.navigationLoads).toEqual({
			count: 2,
			urls: ['https://app.test/assets/alpha.js', 'https://app.test/assets/alpha-closure.js'],
		});
	});

	test('fails a navigation module load after the destination settled', () => {
		const evaluation = evaluatePreloadIntegrity({
			baseUrl: 'https://app.test/',
			actionKind: 'navigation',
			expectedDestination: { settledAfterRequestCount: 1 },
			declaredPreloads: [],
			observedRequests: [
				{ phase: 'action', actionId: 'open-alpha', url: '/assets/alpha.js' },
				{ phase: 'action', actionId: 'open-alpha', url: '/assets/late.js' },
			],
		});

		expect(evaluation.invariant.details).toEqual([
			'open-alpha: module fetched after navigation destination settled: https://app.test/assets/late.js',
		]);
		expect(evaluation.navigationLoads).toEqual({
			count: 1,
			urls: ['https://app.test/assets/alpha.js'],
		});
	});

	test('fails a declared module that was not loaded before the action', () => {
		const evaluation = evaluatePreloadIntegrity({
			baseUrl: 'https://app.test/',
			declaredPreloads: ['/assets/lazy.js'],
			observedRequests: [
				{
					phase: 'action',
					actionId: 'expand-lazy-panel',
					url: '/assets/lazy.js',
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
			declaredPreloads: ['/assets/unused.js'],
			observedRequests: [],
		});

		expect(evaluation.invariant.status).toBe('pass');
		expect(evaluation.warnings).toEqual([
			'declared modulepreload was never loaded: https://app.test/assets/unused.js',
		]);
	});

	test('normalizes absolute, root-relative, build-relative, and fragment URLs', () => {
		const evaluation = evaluatePreloadIntegrity({
			baseUrl: 'https://app.test/app/index.html',
			actionKind: 'navigation',
			expectedDestination: { settledAfterRequestCount: 1 },
			declaredPreloads: ['../assets/chunk.js#declaration'],
			observedRequests: [
				{
					phase: 'navigation',
					url: 'https://app.test/assets/chunk.js',
					resourceType: 'script',
				},
				{
					phase: 'action',
					actionId: 'navigate',
					url: '/assets/chunk.js',
					resourceType: 'script',
				},
			],
		});

		expect(evaluation.invariant.status).toBe('pass');
		expect(evaluation.warnings).toEqual([]);
	});
});
