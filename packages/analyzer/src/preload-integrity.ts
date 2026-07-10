import { normalizeURL, withoutFragment } from 'ufo';
import type { AnalyzerCanonicalInvariantResult } from './contracts.ts';

export type PreloadObservationPhase = 'bootstrap' | 'navigation' | 'action';

export interface PreloadRequestObservation {
	readonly phase: PreloadObservationPhase;
	readonly actionId?: string;
	readonly url: string;
	readonly resourceType?: string;
}

export type PreloadActionKind = 'navigation' | 'interaction';

export interface PreloadExpectedDestination {
	/** Number of action-window requests observed when the destination settled. */
	readonly settledAfterRequestCount: number;
}

export interface PreloadIntegrityInput {
	readonly baseUrl: string;
	readonly actionKind?: PreloadActionKind;
	readonly expectedDestination?: PreloadExpectedDestination;
	readonly declaredPreloads: readonly string[];
	readonly observedRequests: readonly PreloadRequestObservation[];
}

export interface PreloadIntegrityEvaluation {
	readonly invariant: AnalyzerCanonicalInvariantResult;
	readonly navigationLoads: { readonly count: number; readonly urls: readonly string[] };
	readonly warnings: readonly string[];
}

const MODULE_URL = /\.(?:mjs|js)(?:[?#]|$)/i;

export function normalizePreloadUrl(url: string, baseUrl: string): string {
	return withoutFragment(normalizeURL(new URL(url, baseUrl).href));
}

export function evaluatePreloadIntegrity(input: PreloadIntegrityInput): PreloadIntegrityEvaluation {
	const normalize = (url: string) => normalizePreloadUrl(url, input.baseUrl);
	const declared = new Set(input.declaredPreloads.map(normalize));
	const loadedAtAnyPhase = new Set(
		input.observedRequests.filter(isModuleRequest).map((request) => normalize(request.url)),
	);
	let actionRequestCount = 0;
	const actionModuleLoads = input.observedRequests.flatMap((request) => {
		if (request.phase !== 'action') return [];
		actionRequestCount += 1;
		return isModuleRequest(request)
			? [{ request, requestIndex: actionRequestCount, url: normalize(request.url) }]
			: [];
	});
	const isNavigation = input.actionKind === 'navigation';
	const settledAfter = input.expectedDestination?.settledAfterRequestCount ?? actionRequestCount;
	const navigationLoads = isNavigation
		? actionModuleLoads.filter(({ requestIndex }) => requestIndex <= settledAfter)
		: [];
	const failures = isNavigation
		? actionModuleLoads.filter(({ requestIndex }) => requestIndex > settledAfter)
		: actionModuleLoads;
	const details = failures.map(({ request, url }) =>
		isNavigation
			? `${request.actionId ?? 'unknown-action'}: module fetched after navigation destination settled: ${url}`
			: `${request.actionId ?? 'unknown-action'}: module fetched during action without prior preload load: ${url}`,
	);
	const warnings = [...declared]
		.filter((url) => !loadedAtAnyPhase.has(url))
		.map((url) => `declared modulepreload was never loaded: ${url}`);

	return {
		invariant: {
			id: 'MLA-S1-PRELOAD-INTEGRITY',
			status: details.length ? 'fail' : 'pass',
			details,
		},
		navigationLoads: {
			count: navigationLoads.length,
			urls: navigationLoads.map(({ url }) => url),
		},
		warnings,
	};
}

function isModuleRequest(request: PreloadRequestObservation): boolean {
	return request.resourceType === 'script' || MODULE_URL.test(request.url);
}
