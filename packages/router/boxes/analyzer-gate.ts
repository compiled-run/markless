import {
	createVerdictReport,
	evaluatePreloadIntegrity,
	type AnalyzerCanonicalInvariantResult,
	type AnalyzerVerdictReportV2,
} from '@markless/analyzer';
import type { RouterAnalyzerNetworkRule } from './analyzer/policy.ts';

export function createRouterAnalyzerReport(input: {
	readonly identity: { readonly fixture: string } | { readonly matrix: string };
	readonly commitSha: string;
	readonly buildArtifactHash: string;
	readonly results: readonly AnalyzerCanonicalInvariantResult[];
}): AnalyzerVerdictReportV2 {
	return createVerdictReport({
		source: 'witness',
		lane: 'router-analyzer-adoption',
		results: input.results,
		metadata: {
			consumer: '@markless/router',
			...input.identity,
			commitSha: input.commitSha,
			buildArtifactHash: input.buildArtifactHash,
		},
	});
}

export function evaluateRouterRequests(input: {
	readonly pageOrigin: string;
	readonly rules: readonly RouterAnalyzerNetworkRule[];
	readonly requests: readonly {
		readonly method: string;
		readonly url: string;
		readonly status: number | null;
		readonly failedReason?: string | null;
	}[];
}): AnalyzerCanonicalInvariantResult {
	const details = input.requests.flatMap((request) => {
		let url: URL;
		try {
			url = new URL(request.url);
		} catch {
			return [`undeclared request: ${request.method} ${request.url}`];
		}
		const declared = input.rules.some(
			(rule) =>
				rule.method === request.method &&
				url.origin === input.pageOrigin &&
				(typeof rule.path === 'string'
					? `${url.pathname}${url.search}` === rule.path
					: rule.path.test(url.pathname)),
		);
		if (!declared) return [`undeclared request: ${request.method} ${request.url}`];
		if (request.failedReason || request.status === null || request.status >= 400)
			return [
				`failed request: ${request.method} ${request.url} (${request.status ?? request.failedReason ?? 'no response'})`,
			];
		return [];
	});
	return { id: 'MLA-I2-NETWORK', status: details.length ? 'fail' : 'pass', details };
}

export const evaluateRouterPreloadWindow = evaluatePreloadIntegrity;
