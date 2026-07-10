import type { AnalyzerRequestRecord } from './contracts.ts';

export interface RequestClassificationInput {
	readonly pageOrigin: string;
	readonly knownDocumentPaths: readonly string[];
	readonly declaredApi: readonly { readonly method: string; readonly path: string }[];
	readonly phase: 'bootstrap' | 'action';
	readonly method: string;
	readonly url: string;
	readonly resourceType: string;
	readonly status: number | null;
}

export function classifyRequest(
	input: RequestClassificationInput,
): AnalyzerRequestRecord['classification'] {
	let target: URL;
	try {
		target = new URL(input.url);
	} catch {
		return 'violation';
	}
	const sameOrigin = target.origin === input.pageOrigin;
	const successful = input.status !== null && input.status >= 200 && input.status < 400;
	if (input.resourceType === 'document')
		return input.phase === 'bootstrap' &&
			sameOrigin &&
			successful &&
			input.knownDocumentPaths.includes(target.pathname)
			? 'document'
			: 'violation';
	if (
		sameOrigin &&
		successful &&
		(input.method === 'GET' || input.method === 'HEAD') &&
		(target.pathname.startsWith('/build/') || input.phase === 'bootstrap')
	)
		return 'asset';
	if (
		sameOrigin &&
		successful &&
		input.declaredApi.some(
			(contract) =>
				contract.method === input.method &&
				contract.path === `${target.pathname}${target.search}`,
		)
	)
		return 'declared-api';
	return 'violation';
}
