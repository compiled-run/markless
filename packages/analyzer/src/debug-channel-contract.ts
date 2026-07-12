export interface AnalyzerRequiredDebugChannel<ElementType> {
	readonly version: 1;
	readonly containers: readonly {
		readonly boundaries: readonly {
			readonly boundaryId: string;
			readonly status: string;
		}[];
	}[];
	explainInteraction(
		element: ElementType,
		eventName: string,
	): { readonly kind: string; readonly source?: string };
}

export function checkAnalyzerDebugChannelContract(channel: unknown): {
	readonly id: 'MLA-EXT-DEBUG-CHANNEL-CONTRACT';
	readonly status: 'pass' | 'fail';
	readonly details: readonly string[];
} {
	const candidate = typeof channel === 'object' && channel !== null ? channel : undefined;
	const version = candidate === undefined ? undefined : Reflect.get(candidate, 'version');
	const containers = candidate === undefined ? undefined : Reflect.get(candidate, 'containers');
	const explainInteraction =
		candidate === undefined ? undefined : Reflect.get(candidate, 'explainInteraction');
	const compatible =
		version === 1 && Array.isArray(containers) && typeof explainInteraction === 'function';
	return {
		id: 'MLA-EXT-DEBUG-CHANNEL-CONTRACT',
		status: compatible ? 'pass' : 'fail',
		details: compatible
			? ['The emitted web debug channel provides the analyzer-required version 1 surface.']
			: [
					`MLA-EXT-DEBUG-CHANNEL-CONTRACT: expected debug channel version 1; received ${version ?? 'missing'}`,
				],
	};
}
