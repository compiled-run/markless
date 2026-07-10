import { describe, expect, test } from 'vitest';
import { evaluatePreloadIntegrity } from '../src/preload-integrity.ts';

describe('MLA-S1 preload integrity', () => {
	test('passes when an action module was declared and loaded during bootstrap', () => {
		const evaluation = evaluatePreloadIntegrity({
			baseUrl: 'https://app.test/dashboard/',
			declaredPreloads: ['/build/editor.js'],
			observedRequests: [
				{
					phase: 'bootstrap',
					url: 'https://app.test/build/editor.js',
					resourceType: 'script',
				},
				{
					phase: 'action',
					actionId: 'open-editor',
					url: '/build/editor.js',
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
