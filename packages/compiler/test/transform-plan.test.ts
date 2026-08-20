import { expect, test } from 'vitest';
import type { TransformPlanInput } from '../src/artifacts.ts';
import { linkCompilerPasses } from '../src/pass-registry.ts';
import {
	planTransformRequest,
	transformRequestKind,
	transformWakeCapability,
} from '../src/passes/link/transform-plan.ts';

const SOURCE = '/workspace/app/src/page.tsrx';

const baseRequest = {
	resume: false,
	prerenderWake: false,
	renderData: false,
	routeArtifact: false,
	clientPrimary: true,
} as const;

const baseOptions = { dev: false, prerender: false, prerenderWakeChannel: false } as const;

// A client primary source request with every posture gate off: the shape a
// router app has before its wake entry channel exists.
function request(overrides: Partial<TransformPlanInput> = {}): TransformPlanInput {
	return {
		environment: 'client',
		source: SOURCE,
		requestId: SOURCE,
		hasWakeSources: false,
		renderDataReached: false,
		routeArtifactSource: false,
		clientOutput: undefined,
		getModuleInfoAvailable: true,
		...overrides,
		request: { ...baseRequest, ...overrides.request },
		options: { ...baseOptions, ...overrides.options },
	};
}

test('the link pass registry carries the transform-plan pass', () => {
	expect(linkCompilerPasses).toContainEqual({
		passId: 'transform-plan',
		description: expect.stringContaining('transform request'),
		consumes: ['source'],
		produces: ['transformPlan'],
	});
});

test('a client app with no wake channel and no wake sources ships no prerender shaping', () => {
	const plan = planTransformRequest(request());
	expect(plan.ssrPrerenderArtifacts).toBe(false);
	expect(plan.prerenderRecords).toBe(false);
	expect(plan.requestKind).toBe('source');
});

test('the wake channel makes every client request prerender shaped', () => {
	for (const overrides of [
		{},
		{ request: { ...baseRequest, clientPrimary: false, resume: true } },
		{ request: { ...baseRequest, clientPrimary: false, prerenderWake: true } },
		{ request: { ...baseRequest, clientPrimary: false, renderData: true } },
		{ request: { ...baseRequest, clientPrimary: false, routeArtifact: true } },
	] satisfies Partial<TransformPlanInput>[]) {
		const plan = planTransformRequest(
			request({ ...overrides, options: { ...baseOptions, prerenderWakeChannel: true } }),
		);
		expect(plan.prerenderRecords, JSON.stringify(overrides)).toBe(true);
		expect(plan.ssrPrerenderArtifacts, JSON.stringify(overrides)).toBe(true);
	}
});

test('a wake source seen earlier in the build reshapes later client requests', () => {
	const plan = planTransformRequest(request({ hasWakeSources: true }));
	expect(plan.ssrPrerenderArtifacts).toBe(true);
	expect(plan.prerenderRecords).toBe(true);
});

test('render-data and route-artifact requests publish no client claims', () => {
	for (const kind of ['renderData', 'routeArtifact'] as const) {
		const plan = planTransformRequest(
			request({ request: { ...baseRequest, clientPrimary: false, [kind]: true } }),
		);
		expect(plan.publishesClientClaims, kind).toBe(false);
	}
	expect(planTransformRequest(request()).publishesClientClaims).toBe(true);
});

test('the four request kinds of one source cache under four distinct keys', () => {
	const keys = new Map(
		(
			[
				['source', request()],
				[
					'resume',
					request({
						requestId: `${SOURCE}?markless-resume`,
						request: { ...baseRequest, clientPrimary: false, resume: true },
					}),
				],
				[
					'prerender-wake',
					request({
						requestId: `${SOURCE}?markless-prerender-wake`,
						request: { ...baseRequest, clientPrimary: false, prerenderWake: true },
					}),
				],
				[
					'render-data',
					request({
						requestId: `${SOURCE}?markless-render-data`,
						request: { ...baseRequest, clientPrimary: false, renderData: true },
					}),
				],
			] satisfies ReadonlyArray<[string, TransformPlanInput]>
		).map(([kind, input]) => [kind, planTransformRequest(input)]),
	);
	const cacheKeys = [...keys.values()].map((plan) => plan.cacheKey);
	expect(new Set(cacheKeys).size).toBe(4);
	expect(keys.get('resume')!.cacheKey).not.toBe(keys.get('source')!.cacheKey);
	// The key is `environment \0 manifestSource \0 output shape \0 request kind`.
	expect(keys.get('source')!.cacheKey).toBe(['client', SOURCE, 'full', 'source'].join('\0'));
	expect(keys.get('resume')!.cacheKey).toBe(
		['client', `${SOURCE}?markless-resume`, 'full', 'resume'].join('\0'),
	);
});

test('a symbols-only request caches apart from the full request of the same id', () => {
	expect(planTransformRequest(request({ clientOutput: 'symbols-only' })).cacheKey).not.toBe(
		planTransformRequest(request()).cacheKey,
	);
});

// A route artifact is the build-time rendering of a source, not a module shape
// of its own, so splitting the cache on it would only recompile the source.
test('a route-artifact request caches in the source slot but keeps its own kind', () => {
	const plan = planTransformRequest(
		request({ request: { ...baseRequest, routeArtifact: true } }),
	);
	expect(plan.requestKind).toBe('route-artifact');
	expect(plan.cacheKey).toBe(planTransformRequest(request()).cacheKey);
});

test('a server transform neither publishes client claims nor takes prerender records', () => {
	const plan = planTransformRequest(
		request({
			environment: 'server',
			options: { ...baseOptions, prerender: true, prerenderWakeChannel: true },
		}),
	);
	expect(plan.publishesClientClaims).toBe(false);
	expect(plan.prerenderRecords).toBe(false);
	expect(plan.ssrPrerenderArtifacts).toBe(false);
	expect(plan.devResumeReexport).toBe(false);
	expect(plan.manifestSource).toBe(SOURCE);
});

test('the wake aggregate needs module-graph facts and a non-primary request', () => {
	const eligible = request({
		requestId: `${SOURCE}?markless-resume`,
		request: { ...baseRequest, clientPrimary: false, resume: true },
		options: { ...baseOptions, prerenderWakeChannel: true },
	});
	expect(planTransformRequest(eligible).aggregateEligible).toBe(true);
	expect(
		planTransformRequest({ ...eligible, getModuleInfoAvailable: false }).aggregateEligible,
	).toBe(false);
	expect(
		planTransformRequest({
			...eligible,
			requestId: SOURCE,
			request: { ...baseRequest, clientPrimary: true },
		}).aggregateEligible,
	).toBe(false);
	expect(planTransformRequest({ ...eligible, options: baseOptions }).aggregateEligible).toBe(
		false,
	);
});

test('a registered route-artifact source compiles development shaped', () => {
	expect(planTransformRequest(request({ routeArtifactSource: true })).dev).toBe(true);
	expect(planTransformRequest(request()).dev).toBe(false);
	expect(
		planTransformRequest(request({ environment: 'server', routeArtifactSource: true })).dev,
	).toBe(false);
});

test('a module wakes the browser if it or any child it composes carries triggers', () => {
	expect(transformWakeCapability(false, false)).toBe(false);
	expect(transformWakeCapability(true, false)).toBe(true);
	expect(transformWakeCapability(false, true)).toBe(true);
});

test('request kind resolves one id to exactly one shape', () => {
	expect(transformRequestKind({ ...baseRequest })).toBe('source');
	expect(transformRequestKind({ ...baseRequest, resume: true })).toBe('resume');
	expect(transformRequestKind({ ...baseRequest, prerenderWake: true })).toBe('prerender-wake');
	expect(transformRequestKind({ ...baseRequest, renderData: true })).toBe('render-data');
	expect(transformRequestKind({ ...baseRequest, routeArtifact: true })).toBe('route-artifact');
});
