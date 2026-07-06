import type { MarklessVirtualModule, RuntimeDemandMapManifest } from '../src/types.ts';

export type PayloadRecordInventory = {
	readonly events?: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly eventName: string;
		readonly syncPolicy?: unknown;
	}>;
	readonly locators?: ReadonlyArray<{ readonly hostNodeId: string; readonly index: number }>;
	readonly domUpdates?: ReadonlyArray<{ readonly hostNodeId: string }>;
	readonly keyedRepeats?: ReadonlyArray<{
		readonly parentHostNodeId: string;
		readonly rowEvents: ReadonlyArray<{ readonly eventName: string; readonly syncPolicy?: unknown }>;
	}>;
	readonly branches?: ReadonlyArray<unknown>;
	readonly asyncBoundaries?: ReadonlyArray<unknown>;
	readonly behaviors?: ReadonlyArray<{ readonly hostNodeId: string }>;
	readonly elementHandles?: ReadonlyArray<{ readonly hostNodeId: string }>;
	readonly runtimeDemandMap?: RuntimeDemandMapManifest;
};

export type RuntimeDispatchAction = {
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly recordKind?: 'event' | 'keyed-repeat-row';
	readonly syncPolicy?: unknown;
	readonly executionLog?: boolean;
};

const OBSERVABILITY_MODULES = [
	'virtual:markless:dev-log',
	'web/dev-log',
	'web/execution-log-target',
];

const KNOWN_PAYLOAD_RECORD_KEYS = new Set([
	'version',
	'locators',
	'events',
	'domUpdates',
	'keyedRepeats',
	'branches',
	'asyncBoundaries',
	'behaviors',
	'elementHandles',
	'runtimeDemandMap',
]);

export function deriveAllowedModules(
	payloadRecordInventory: PayloadRecordInventory,
	action: RuntimeDispatchAction,
): ReadonlySet<string> {
	const map = payloadRecordInventory.runtimeDemandMap;
	if (!map) {
		throw new Error('Expected payload runtimeDemandMap for generated execution expectations.');
	}
	const allowed = new Set(
		hasUnknownRecordKind(payloadRecordInventory)
			? map.unknownRecordModuleIds
			: exactActionModules(map, action),
	);
	if (action.executionLog) {
		for (const id of OBSERVABILITY_MODULES) allowed.add(id);
	}
	return allowed;
}

export function forbiddenExecutedModules(
	executed: Iterable<string>,
	allowed: ReadonlySet<string>,
): string[] {
	return [...executed]
		.filter((id) => !isAllowedDispatchCoreVirtual(id) && isMarklessRuntimeModule(id) && !allowed.has(id))
		.sort();
}

export function assertDemandMapMatchesEmittedSymbolImports(
	virtualModules: ReadonlyArray<MarklessVirtualModule>,
	demandMap: RuntimeDemandMapManifest,
): void {
	const emittedBySymbol = new Map(
		virtualModules
			.filter((module) => module.type === 'symbol' && module.symbolId)
			.map((module) => [module.symbolId!, runtimeImportsFromSource(module.source)]),
	);
	for (const symbol of demandMap.symbols) {
		const actual = emittedBySymbol.get(symbol.symbolId) ?? [];
		const expected = [...symbol.runtimeModuleIds].sort();
		const missing = expected.filter((id) => !actual.includes(id));
		const extra = actual.filter((id) => !expected.includes(id));
		if (missing.length > 0 || extra.length > 0) {
			throw new Error(
				`Demand map mismatch for ${symbol.symbolId}: missing=[${missing.join(', ')}] extra=[${extra.join(', ')}]`,
			);
		}
	}
}

function exactActionModules(
	map: RuntimeDemandMapManifest,
	action: RuntimeDispatchAction,
): ReadonlyArray<string> {
	const recordKind = action.recordKind ?? 'event';
	const match = map.actions.find(
		(entry) =>
			entry.hostNodeId === action.hostNodeId &&
			entry.eventName === action.eventName &&
			entry.recordKind === recordKind,
	);
	if (!match) {
		throw new Error(
			`Demand map has no action entry for ${recordKind}:${action.hostNodeId}:${action.eventName}.`,
		);
	}
	return match.runtimeModuleIds;
}

function runtimeImportsFromSource(source: string): string[] {
	return [
		...new Set(
			[...source.matchAll(/from ['"]@markless\/web\/fns\/([^'"]+)['"]/g)].map(
				(match) => `web/fns/${match[1]}`,
			),
		),
	].sort();
}

function hasUnknownRecordKind(payloadRecordInventory: PayloadRecordInventory): boolean {
	return Object.keys(payloadRecordInventory).some((key) => !KNOWN_PAYLOAD_RECORD_KEYS.has(key));
}

function isMarklessRuntimeModule(id: string): boolean {
	return id.startsWith('web/') || id.startsWith('core/') || id === 'virtual:markless:dev-log';
}

function isAllowedDispatchCoreVirtual(id: string): boolean {
	return id.startsWith('virtual:markless:payload:') || id.startsWith('virtual:markless:symbol:');
}
