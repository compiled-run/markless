// Pass `transform-plan`: the per-request decisions a transform makes before it
// compiles anything. What shape of module a request asks for, whether it may
// publish claims, whether it is prerender shaped, and which cache slot it owns
// are all program semantics, so they are decided here from injected values. The
// caller keeps everything that is genuinely the bundler's: parsing module ids,
// reading the build environment, the caches, registries, and module-graph I/O.
import type {
	TransformPlanArtifact,
	TransformPlanInput,
	TransformRequestKind,
} from '../../artifacts.ts';

export const TRANSFORM_PLAN_PASS_ID = 'transform-plan';

// One id answers at most one of these questions; the order settles the rest.
export function transformRequestKind(request: TransformPlanInput['request']): TransformRequestKind {
	if (request.resume) return 'resume';
	if (request.prerenderWake) return 'prerender-wake';
	if (request.renderData) return 'render-data';
	if (request.routeArtifact) return 'route-artifact';
	return 'source';
}

// A route artifact caches as an ordinary source request: its emitted shape is
// decided by the source and its materializations, never by the query that
// asked for it, so giving it a slot of its own would only split the cache.
function transformCacheKind(kind: TransformRequestKind): string {
	return kind === 'route-artifact' ? 'source' : kind;
}

// A module wakes the browser if its own manifest carries browser triggers or
// any child it composes does. A parent cannot be less capable than its child.
export function transformWakeCapability(
	manifestHasBrowserTriggers: boolean,
	childHasBrowserTriggers: boolean,
): boolean {
	return manifestHasBrowserTriggers || childHasBrowserTriggers;
}

export function planTransformRequest(input: TransformPlanInput): TransformPlanArtifact {
	const clientEnvironment = input.environment === 'client';
	const requestKind = transformRequestKind(input.request);
	const manifestSource =
		clientEnvironment && !input.request.clientPrimary ? input.requestId : input.source;
	// Render data is a data-only facade and a route artifact is a build-time
	// rendering; neither owns the source's browser symbols.
	const publishesClientClaims =
		clientEnvironment && !input.request.renderData && !input.request.routeArtifact;
	// Children reshape only when this build actually has wake-variant
	// entries; router apps have none until their entry channel exists,
	// and reshaping their children alone ships dead bytes into walls.
	// Router apps signal wake eligibility through per-page wake requests
	// rather than the SSR symbol input, so either signal opens the gate.
	// With the router wake channel, every client transform is prerender
	// shaped (same order-independent semantics as MARKLESS_PRERENDER=1):
	// wake requests arrive after package children are already cached.
	// The wake channel (env-captured at plugin construction, or the
	// router's late per-page wake requests) is the ONLY trigger: bare
	// emitResumeModules must not reshape ordinary SSR apps — their
	// symbol-route pages would inherit prerenderDataId and the no-op
	// container-event stub, silently swallowing clicks.
	const ssrPrerenderArtifacts =
		clientEnvironment && (input.options.prerenderWakeChannel || input.hasWakeSources);
	const prerenderRecords =
		clientEnvironment &&
		(input.options.prerender ||
			input.options.prerenderWakeChannel ||
			input.renderDataReached ||
			input.request.prerenderWake ||
			ssrPrerenderArtifacts);
	return {
		passId: TRANSFORM_PLAN_PASS_ID,
		requestKind,
		manifestSource,
		publishesClientClaims,
		ssrPrerenderArtifacts,
		prerenderRecords,
		// A registered route artifact opts its own source into development-shaped
		// output: the artifact is rendered at build time and must carry the
		// diagnostics a dev build would have produced.
		dev: input.options.dev || (clientEnvironment && input.routeArtifactSource),
		devResumeReexport: input.options.dev && clientEnvironment,
		// One source can be requested as a full environment entry, a symbols-only
		// interaction entry, or a dev resume entry. Their linked interfaces are the
		// same, but their emitted module shapes are deliberately different.
		cacheKey: [
			input.environment,
			manifestSource,
			input.clientOutput ?? 'full',
			transformCacheKind(requestKind),
		].join('\0'),
		aggregateEligible:
			publishesClientClaims &&
			!input.request.clientPrimary &&
			input.options.prerenderWakeChannel &&
			input.getModuleInfoAvailable,
		wakeCapability: transformWakeCapability,
	};
}
