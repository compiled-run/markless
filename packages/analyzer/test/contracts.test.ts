import { describe, expect, test } from 'vitest';
import {
	assertMatrixFileSetEquality,
	appendInvariantResult,
	candidateInvariantReport,
	classifyAnchorWithoutHref,
	classifyRequest,
	compareExecutedBytes,
	countExecutedUtf8Bytes,
	evaluateBoundaries,
	evaluateCandidate,
	executedJavaScriptBytes,
	mergeCoverageRanges,
	createVerdictReport,
	normalizeInvariantId,
	readVerdictReport,
	validateVerdictReport,
	validateMatrixDocument,
} from '../src/index.ts';

describe('analyzer contracts', () => {
	test('normalizes legacy browser invariant aliases into the MLA namespace', () => {
		expect(normalizeInvariantId('BQA-I4-WIRING-MISSING')).toBe('MLA-I4-WIRING-MISSING');
		expect(normalizeInvariantId('MLA-S2-PAYLOAD-WIRING')).toBe('MLA-S2-PAYLOAD-WIRING');
		expect(normalizeInvariantId('MLA-EXT-SURFACE-WITNESS')).toBe('MLA-EXT-SURFACE-WITNESS');
	});

	test('validates, appends, and JSON-round-trips unified verdict reports', () => {
		const initial = createVerdictReport({
			source: 'surface-witness',
			lane: 'preload',
			results: [{ id: 'BQA-I1-CONSOLE', status: 'pass', details: [] }],
		});
		expect(initial).toEqual({
			version: 2,
			source: 'surface-witness',
			lane: 'preload',
			results: [{ id: 'MLA-I1-CONSOLE', status: 'pass', details: [] }],
			passed: true,
		});
		const appended = appendInvariantResult(initial, {
			id: 'MLA-S1-PRELOAD-INTEGRITY',
			status: 'fail',
			details: ['missing preload'],
		});
		expect(readVerdictReport(JSON.parse(JSON.stringify(appended)))).toEqual(appended);
		expect(appended.passed).toBe(false);
		expect(initial.results).toHaveLength(1);
	});

	test('rejects malformed unified reports with a schema path', () => {
		expect(() =>
			validateVerdictReport({
				version: 2,
				source: 'pass-tests',
				lane: 'payload',
				results: [{ id: 'MLA-EXT-', status: 'pass', details: [] }],
				passed: true,
			}),
		).toThrow(/\$report\.results\[0\]\.id/);
	});

	test('reads v1 browser reports and normalizes nested BQA results', () => {
		const report = readVerdictReport({
			version: 1,
			build: { debugEnabled: true, marklessSha: 'abc', artifactHash: 'def' },
			actions: [
				{
					routeFile: 'pages/index.tsrx',
					fixtureUrlId: 'home',
					actionId: 'bootstrap',
					startedAt: '2026-07-10T00:00:00.000Z',
					durationMs: 1,
					console: [],
					requests: [],
					executedBytes: 10,
					invariants: [
						{ id: 'BQA-I2-NETWORK', status: 'fail', details: ['unexpected request'] },
					],
					knownAudit: [],
				},
			],
			passed: false,
		});
		expect(report).toMatchObject({
			version: 2,
			source: 'browser-qa',
			lane: 'browser-invariants',
			results: [{ id: 'MLA-I2-NETWORK', status: 'fail' }],
			passed: false,
		});
	});

	test('evaluates boundary liveness and expected rejection policy', () => {
		const pending = {
			boundaryId: 'profile-read',
			readIndex: 0,
			graphNodeId: 'read:profile',
			status: 'pending' as const,
			runVersion: 2,
			pendingSince: 1_000,
			hasSettledContent: true,
		};
		expect(evaluateBoundaries([pending], 5_999, { allow: false }, [])).toEqual({
			settled: false,
			results: [],
		});
		expect(evaluateBoundaries([pending], 6_000, { allow: false }, []).results[0]).toMatchObject(
			{ id: 'BQA-I3-PENDING-TIMEOUT', status: 'fail' },
		);
		expect(
			evaluateBoundaries(
				[{ ...pending, boundaryId: 'optional', status: 'rejected' }],
				0,
				{ allow: false },
				['optional'],
			).results,
		).toEqual([]);
	});

	test('applies candidate and known-audit policy', () => {
		const dead = evaluateCandidate({
			identity: '#save',
			classification: 'button',
			expectedEvents: ['click'],
			explanations: { click: { kind: 'none' } },
		});
		expect(dead.map(({ id }) => id)).toEqual(['BQA-I4-WIRING-MISSING']);
		expect(
			evaluateCandidate({
				identity: '#native',
				classification: 'native-anchor',
				expectedEvents: [],
				explanations: {},
			}),
		).toEqual([]);
		expect(
			evaluateCandidate({
				identity: '#route',
				classification: 'markless-link',
				expectedEvents: ['click'],
				explanations: { click: { kind: 'resume-record' } },
			})[0]?.id,
		).toBe('BQA-I4-WIRING-MISSING');
		expect(classifyAnchorWithoutHref(false, -1, null)).toBe('excluded');
		expect(classifyAnchorWithoutHref(false, 0, null)).toBe('unknown-focusable');
		const report = candidateInvariantReport([
			{ knownAuditId: 'legacy-menu', violations: dead },
		]);
		expect(report.results[0]).toMatchObject({ status: 'pass' });
		expect(report.knownAudit[0]?.id).toBe('legacy-menu');
	});

	test('merges V8 ranges, subtracts zero-count spans, and counts UTF-8 bytes', () => {
		const ranges = mergeCoverageRanges([
			{ startOffset: 1, endOffset: 4 },
			{ startOffset: 0, endOffset: 3 },
		]);
		expect(ranges).toEqual([{ startOffset: 0, endOffset: 4 }]);
		expect(countExecutedUtf8Bytes('a😀éz', ranges)).toBe(7);
		expect(
			executedJavaScriptBytes(
				[
					{
						url: 'https://app.test/app.js',
						source: 'abcdefghij',
						functions: [
							{
								ranges: [
									{ startOffset: 0, endOffset: 10, count: 1 },
									{ startOffset: 3, endOffset: 6, count: 0 },
								],
							},
						],
					},
				],
				'https://app.test',
			),
		).toBe(7);
	});

	test('classifies bootstrap, action, document, and declared API requests', () => {
		const base = {
			pageOrigin: 'https://app.test',
			knownDocumentPaths: ['/'],
			declaredApi: [{ method: 'GET', path: '/api/items?limit=1' }],
			method: 'GET',
			status: 200,
		} as const;
		expect(
			classifyRequest({
				...base,
				phase: 'bootstrap',
				url: 'https://app.test/styles.css',
				resourceType: 'stylesheet',
			}),
		).toBe('asset');
		expect(
			classifyRequest({
				...base,
				phase: 'action',
				url: 'https://app.test/styles.css',
				resourceType: 'stylesheet',
			}),
		).toBe('violation');
		expect(
			classifyRequest({
				...base,
				phase: 'bootstrap',
				url: 'https://app.test/',
				resourceType: 'document',
			}),
		).toBe('document');
		expect(
			classifyRequest({
				...base,
				phase: 'action',
				url: 'https://app.test/api/items?limit=1',
				resourceType: 'fetch',
			}),
		).toBe('declared-api');
	});

	test('validates matrix references and exact route file equality', () => {
		const action = {
			id: 'open',
			fixtureUrlId: 'home',
			safety: 'safe',
			defaultCrawl: true,
			locator: { kind: 'testId', value: 'open-control' },
			operation: 'click',
			expectedEventTypes: ['click'],
			expectedInteraction: 'router-delegation',
			apiContractIds: [],
			pendingPolicy: { allow: false },
			expectedRejectedBoundaryIds: [],
			reset: { mode: 'none' },
		};
		const route = {
			routeFile: 'pages/index.tsrx',
			fixtureUrls: [{ id: 'home', url: '/#/' }],
			apiContracts: [],
			actions: [action],
			bootstrapPendingPolicy: { allow: false },
			bootstrapExpectedRejectedBoundaryIds: [],
			resetRequirements: {
				beforeRoute: 'reuse-read-only-fixture',
				beforeEachAction: 'fresh-browser-context',
				afterMutatingAction: 'discard-fixture',
			},
		};
		const valid = { schemaVersion: 1, routes: [route] };
		expect(validateMatrixDocument(valid)).toEqual(valid);
		expect(() =>
			validateMatrixDocument({
				...valid,
				routes: [{ ...route, actions: [{ ...action, fixtureUrlId: 'missing' }] }],
			}),
		).toThrow(/fixtureUrlId.*missing/i);
		expect(() =>
			assertMatrixFileSetEquality(valid as never, ['pages/index.tsrx']),
		).not.toThrow();
		expect(() => assertMatrixFileSetEquality(valid as never, ['pages/other.mdx'])).toThrow(
			/missing=.*other.*stale=.*index/i,
		);
	});

	test('uses distinct bootstrap and action budgets', () => {
		const budgets = { bootstrapCeilingBytes: 100, actionCeilingBytes: 50 };
		expect(compareExecutedBytes('bootstrap', 101, budgets)).toMatchObject({
			id: 'BQA-I5-BOOTSTRAP-BUDGET',
			status: 'fail',
		});
		expect(compareExecutedBytes('activate', 50, budgets)).toMatchObject({
			id: 'BQA-I5-ACTION-BUDGET',
			status: 'pass',
		});
	});
});
