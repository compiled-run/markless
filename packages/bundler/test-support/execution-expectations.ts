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
]);

export function deriveAllowedModules(
	payloadRecordInventory: PayloadRecordInventory,
	runtimeDemandMap: RuntimeDemandMapManifest,
	action: RuntimeDispatchAction,
): ReadonlySet<string> {
	const allowed = new Set(
		hasUnknownRecordKind(payloadRecordInventory)
			? runtimeDemandMap.unknownRecordModuleIds
			: exactActionModules(runtimeDemandMap, action),
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
	return [
		...match.runtimeModuleIds,
		...interpreterModulesForUnreplacedKinds(
			map,
			(match as { readonly recordKinds?: ReadonlyArray<string> }).recordKinds ?? [
				recordKind === 'keyed-repeat-row' ? 'keyed-repeat' : recordKind,
			],
		),
	];
}

function interpreterModulesForUnreplacedKinds(
	map: RuntimeDemandMapManifest,
	kinds: ReadonlyArray<string>,
): ReadonlyArray<string> {
	const phases = new Map(
		((map as { readonly recordKinds?: ReadonlyArray<{ readonly kind: string; readonly replaced: boolean }> })
			.recordKinds ?? []).map((kind) => [kind.kind, kind.replaced]),
	);
	return unique(
		kinds.flatMap((kind) =>
			phases.get(kind) === false ? interpreterChainForKind(kind) : [],
		),
	);
}

function interpreterChainForKind(kind: string): ReadonlyArray<string> {
	return runtimeImportClosure(INTERPRETER_ROOTS_BY_KIND[kind] ?? []);
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

const INTERPRETER_ROOTS_BY_KIND: Record<string, ReadonlyArray<string>> = {
	event: ['core/web/event-only-resume', 'web/event-only-resume'],
	'dom-update': ['core/web/resume', 'web/resume', 'web/fns/csr', 'web/fns/html', 'web/fns/state'],
	'keyed-repeat': ['core/web/resume', 'web/resume'],
	branch: ['core/web/resume', 'web/resume'],
	'async-boundary': ['core/web/resume', 'web/resume'],
	behavior: ['core/web/resume', 'web/resume'],
	'element-handle': ['core/web/resume', 'web/resume'],
};

function runtimeImportClosure(roots: ReadonlyArray<string>): ReadonlyArray<string> {
	const seen = new Set<string>();
	const queue = [...roots];
	for (const id of queue) {
		if (seen.has(id)) continue;
		seen.add(id);
		for (const dep of RUNTIME_IMPORT_EDGES[id] ?? []) queue.push(dep);
	}
	return [...seen]
		.filter((id) => isMarklessRuntimeModule(id) && !INTERPRETER_CHAIN_EXCLUDED_MODULES.has(id))
		.sort();
}

function unique(values: ReadonlyArray<string | undefined>): string[] {
	return [...new Set(values.filter((value): value is string => !!value))].sort();
}

const INTERPRETER_CHAIN_EXCLUDED_MODULES = new Set(['web/dom-journal']);
const RUNTIME_IMPORT_EDGES: Record<string, ReadonlyArray<string>> = {
	'core/web/event-only-resume': ['web/event-only-resume'],
	'core/web/resume': ['web/resume'],
	'web/event-only-resume': ['web/event-only-behaviors', 'web/event-only-graph', 'web/execution-log-target', 'web/inline/payload-document', 'web/inline/resume-errors', 'web/inline/sync-policy-core', 'web/payload'],
	'web/payload': ['web/payload-full'],
	'web/payload-full': ['web/payload-document', 'web/payload-graph-construct', 'web/payload-resume', 'web/payload-resume-registry'],
	'web/payload-resume': ['web/dom-journal', 'web/payload-full', 'web/payload-graph-construct', 'web/payload-resume-registry', 'web/resume'],
	'web/resume': ['web/inline/resume-errors', 'web/resume-runtime'],
	'web/resume-events': ['web/execution-log-target', 'web/inline/sync-policy-core', 'web/resume-keyed-repeats'],
	'web/resume-runtime': ['web/resume-behaviors', 'web/resume-branches', 'web/resume-events', 'web/resume-runtime-shared', 'web/resume-runtime-start'],
	'web/resume-runtime-start': ['web/resume-async-wiring', 'web/resume-keyed-repeats', 'web/resume-locators', 'web/resume-runtime-shared', 'web/resume-sync-demand'],
};
