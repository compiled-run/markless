import { normalizeURL, withoutFragment } from 'ufo';
import type { AnalyzerCanonicalInvariantResult } from './contracts.ts';

export type PreloadObservationPhase = 'bootstrap' | 'navigation' | 'action';

export interface PreloadRequestObservation {
	readonly phase: PreloadObservationPhase;
	readonly actionId?: string;
	readonly url: string;
	readonly resourceType?: string;
}

export interface PreloadIntegrityInput {
	readonly baseUrl: string;
	readonly declaredPreloads: readonly string[];
	readonly observedRequests: readonly PreloadRequestObservation[];
}

export interface PreloadIntegrityEvaluation {
	readonly invariant: AnalyzerCanonicalInvariantResult;
	readonly warnings: readonly string[];
}

const MODULE_URL = /\.(?:mjs|js)(?:[?#]|$)/i;

export function normalizePreloadUrl(url: string, baseUrl: string): string {
	return withoutFragment(normalizeURL(new URL(url, baseUrl).href));
}

export function evaluatePreloadIntegrity(input: PreloadIntegrityInput): PreloadIntegrityEvaluation {
	const normalize = (url: string) => normalizePreloadUrl(url, input.baseUrl);
	const declared = new Set(input.declaredPreloads.map(normalize));
	const loadedBeforeAction = new Set(
		input.observedRequests
			.filter((request) => request.phase !== 'action' && isModuleRequest(request))
			.map((request) => normalize(request.url)),
	);
	const loadedAtAnyPhase = new Set(
		input.observedRequests.filter(isModuleRequest).map((request) => normalize(request.url)),
	);
	const ready = new Set([...declared].filter((url) => loadedBeforeAction.has(url)));
	const details = input.observedRequests
		.filter((request) => request.phase === 'action' && isModuleRequest(request))
		.map((request) => ({ request, url: normalize(request.url) }))
		.filter(({ url }) => !ready.has(url))
		.map(
			({ request, url }) =>
				`${request.actionId ?? 'unknown-action'}: module fetched during action without prior preload load: ${url}`,
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
		warnings,
	};
}

function isModuleRequest(request: PreloadRequestObservation): boolean {
	return request.resourceType === 'script' || MODULE_URL.test(request.url);
}
