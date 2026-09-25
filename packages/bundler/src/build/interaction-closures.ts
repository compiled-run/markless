import { rootRelativeId } from '../module-id.ts';
import { MARKLESS_INTERACTION_CLOSURES } from './chunking.ts';
import {
	LEAN_DISPATCH_MARKER_MODULES,
	type RuntimeDemandMapFirstUse,
	type RuntimeDemandMapFirstUseReach,
	type RuntimeDemandMapPassedProp,
	type RuntimeDemandMapRecordKind,
} from '@markless/compiler';
import { PROTOCOL_EVENT_ACTION_KIND } from '@markless/serializer';
import type { RuntimeDemandMapManifest } from '../types.ts';
import { runtimeModuleIdFromOrigin } from './bundle-graph.ts';
import {
	CARRIES_UNLISTED_RECORDS,
	undemandedRuntimeModules,
	withUndemandedReExportDoors,
} from './undemanded-runtime.ts';
import { symbolVirtualModuleId, symbolVirtualModuleSourceFile } from '../source-module.ts';
import { isRouteNavigationSourceRequest, normalizeVirtualId } from '../virtual-ids.ts';

export const MARKLESS_INTERACTION_CLOSURES_VERSION = 1;

// Records whose code can run on a landing page before any input: boot holds their symbols.
// The rest run only through an input or the writes it makes, inside some control's first use.
const RUNS_WITHOUT_INPUT = {
	'async-boundary': true,
	behavior: true,
	branch: false,
	'dom-update': false,
	'element-handle': true,
	[PROTOCOL_EVENT_ACTION_KIND.event]: false,
	[PROTOCOL_EVENT_ACTION_KIND.externalDelegate]: false,
	'keyed-repeat': false,
	overlay: true,
} satisfies Record<RuntimeDemandMapRecordKind, boolean>;

const LEAN_DISPATCH_MODULE_IDS: ReadonlySet<string> = new Set(
	Object.values(LEAN_DISPATCH_MARKER_MODULES).flat(),
);

export type InteractionClosureModule = {
	readonly dependencies: readonly string[];
	readonly dynamicDependencies?: readonly string[];
	readonly source?: string;
	readonly reachedFrom?: string;
	readonly reExportsOnly?: boolean;
};

export type InteractionDemandSource = {
	// The emitted module's source request; the file is everything before `?`.
	readonly source: string;
	readonly map: RuntimeDemandMapManifest | undefined;
};

export type InteractionConsumerKind = 'boot' | 'render' | 'action';

export type InteractionConsumer = {
	readonly key: string;
	readonly kind: InteractionConsumerKind;
	// Set when the demand map could not bound this consumer and the superset was taken.
	readonly conservative?: string;
	// An action the compiler serves on a lean dispatch path: its first event runs without the full resume runtime.
	readonly lean?: boolean;
	readonly modules: readonly string[];
};

export type RouteInteractionClosures = {
	readonly route: string;
	// Set when the route has no usable demand data; the planner keeps its packs unsplit.
	readonly fallback?: string;
	readonly consumers: readonly InteractionConsumer[];
};

type MergedDemand = {
	missing: boolean;
	replaced: boolean;
	readonly records: Map<string, Set<string>>;
	// Symbols of the records whose code can run before any input.
	readonly landingSymbols: Set<string>;
	readonly actions: Map<
		string,
		{
			readonly hostNodeId: string;
			readonly eventName: string;
			readonly recordKinds: Set<string>;
			readonly recordIds: Set<string>;
			readonly runtimeModuleIds: Set<string>;
			// Every source map's first use of this action; null when one carries none.
			firstUse: RuntimeDemandMapFirstUse[] | null;
			// Some consequence of the action could not be classified by the compiler.
			unknown: boolean;
		}
	>;
	readonly unknownRecordModuleIds: Set<string>;
	readonly page: FilePage;
};

// What one file adds to the first use of every action on a page it is part of.
type FilePage = {
	// What resume start runs, whichever control wakes the page; 'unknown' when unbounded.
	resume: RuntimeDemandMapFirstUse[] | 'unknown';
	readonly pageSpaceReaders: Map<string, RuntimeDemandMapFirstUseReach[]>;
	readonly passedProps: RuntimeDemandMapPassedProp[];
	readonly callbackSlots: Map<string, Set<string>>;
};

type OwnedReach = { readonly file: string; readonly reach: RuntimeDemandMapFirstUse };

type PageIndex = {
	readonly resumeUnknown: boolean;
	readonly resume: OwnedReach[];
	readonly readers: Map<
		string,
		Array<{ readonly file: string; readonly reach: RuntimeDemandMapFirstUseReach }>
	>;
	readonly passed: Array<{ readonly file: string; readonly prop: RuntimeDemandMapPassedProp }>;
	readonly slots: Map<string, Array<{ readonly file: string; readonly prop: string }>>;
};

// Per route: which modules boot needs, which the client render path needs, and which each
// compiled control's first use needs, over the pre-tree-shake graph. Boot and render follow every
// import within the route; a control follows the dynamic imports its demand map cannot rule out.
export function computeInteractionClosures(input: {
	readonly root: string;
	readonly modules: ReadonlyMap<string, InteractionClosureModule>;
	readonly routes: ReadonlyMap<string, readonly string[]>;
	readonly demand: Iterable<InteractionDemandSource>;
}): RouteInteractionClosures[] {
	const { modules } = input;
	const sources = [...input.demand];
	const demand = mergeDemand(sources);
	const byRuntimeId = new Map<string, string[]>();
	const byVirtualId = new Map<string, string>();
	const symbolsByFile = new Map<string, string[]>();
	const siblings = new Map<string, string[]>();
	for (const [id, module] of modules) {
		const runtimeId = runtimeModuleIdFromOrigin(id.split('?')[0]!);
		if (runtimeId) push(byRuntimeId, runtimeId, id);
		const virtualId = normalizeVirtualId(id);
		byVirtualId.set(virtualId, id);
		const symbolFile = symbolVirtualModuleSourceFile(virtualId);
		if (symbolFile) push(symbolsByFile, symbolFile, id);
		if (module.source && module.reachedFrom === undefined) push(siblings, module.source, id);
	}
	const routeOf = new Map<string, string>();
	for (const [route, ids] of input.routes) for (const id of ids) routeOf.set(id, route);
	const knownRuntimeIds = new Set<string>();
	for (const merged of demand.values())
		for (const id of merged.unknownRecordModuleIds) knownRuntimeIds.add(id);

	// Static and dynamic imports, never into another route. When bounded, a dynamic import is also
	// skipped when demand data names who loads it: the file's own symbols (its map bounds them;
	// another file's resolver may not) and, given a runtime set, known runtime outside it.
	const useClosure = (
		route: string,
		// What the route can load at all; a demand map may name runtime this route never imports.
		reach: ReadonlySet<string>,
		seeds: Iterable<string>,
		bound?: { readonly runtimeIds?: ReadonlySet<string> },
	): string[] => {
		const seen = new Set<string>();
		const pending = [...seeds];
		while (pending.length) {
			const id = pending.pop()!;
			if (seen.has(id) || !reach.has(id)) continue;
			const module = modules.get(id);
			if (!module) continue;
			seen.add(id);
			pending.push(...module.dependencies);
			for (const target of module.dynamicDependencies ?? []) {
				if (routeOf.has(target) && routeOf.get(target) !== route) continue;
				if (!bound) {
					pending.push(target);
					continue;
				}
				const symbolFile = symbolVirtualModuleSourceFile(normalizeVirtualId(target));
				if (
					symbolFile &&
					symbolFile === module.source?.split('?')[0] &&
					demand.get(symbolFile) &&
					!demand.get(symbolFile)!.missing
				)
					continue;
				const runtimeId = runtimeModuleIdFromOrigin(target.split('?')[0]!);
				if (
					bound.runtimeIds &&
					runtimeId &&
					knownRuntimeIds.has(runtimeId) &&
					!bound.runtimeIds.has(runtimeId)
				)
					continue;
				pending.push(target);
			}
		}
		return [...seen].sort();
	};

	const result: RouteInteractionClosures[] = [];
	for (const route of [...input.routes.keys()].sort()) {
		const roots = input.routes.get(route)!;
		const reach = new Set<string>();
		const pending = [...roots];
		while (pending.length) {
			const id = pending.pop()!;
			if (reach.has(id)) continue;
			if (routeOf.has(id) && routeOf.get(id) !== route) continue;
			const module = modules.get(id);
			if (!module) continue;
			reach.add(id);
			pending.push(...module.dependencies, ...(module.dynamicDependencies ?? []));
			if (module.source) pending.push(...(siblings.get(module.source) ?? []));
		}
		const files = new Set<string>();
		for (const id of reach) {
			const file = symbolVirtualModuleSourceFile(normalizeVirtualId(id));
			if (file) files.add(file);
		}
		for (const id of reach) {
			const file = modules.get(id)?.source?.split('?')[0];
			if (file && demand.has(file)) files.add(file);
		}
		const missing = [...files].filter((file) => !demand.get(file) || demand.get(file)!.missing);
		if (missing.length) {
			result.push({
				route,
				fallback: `missing-demand-map:${display(missing.sort()[0]!, input.root)}`,
				consumers: [],
			});
			continue;
		}
		// Runtime a feature needs loads on this route only when the route's own demand maps name it.
		const undemanded = withUndemandedReExportDoors(
			modules,
			routeUndemandedRuntime(
				sources
					.filter(({ source }) => files.has(source.split('?')[0]!))
					.map(({ map }) => map),
				reach,
			),
		);
		if (undemanded.size) {
			reach.clear();
			pending.push(...roots);
			while (pending.length) {
				const id = pending.pop()!;
				if (reach.has(id)) continue;
				if (routeOf.has(id) && routeOf.get(id) !== route) continue;
				const module = modules.get(id);
				if (!module) continue;
				reach.add(id);
				pending.push(
					...module.dependencies,
					...(module.dynamicDependencies ?? []).filter(
						(target) => !undemanded.has(target),
					),
				);
				if (module.source) pending.push(...(siblings.get(module.source) ?? []));
			}
		}
		// The route facade and its own render data serve client navigation; landing boots through resume.
		const renderRoots = roots.filter(isRouteNavigationSourceRequest);
		const bootRoots = roots.filter((id) => !isSymbolModule(id) && !renderRoots.includes(id));
		// All a landing page can import, whatever runs: the fail-closed set for an unbounded first use.
		const landingReach = useClosure(
			route,
			reach,
			roots.filter((id) => !renderRoots.includes(id)),
		);
		const page = pageIndex(files, demand);
		// Boot holds what resume start and the records that run before input need; a symbol only some control's
		// first use or no known path loads is left to that control's closure or to on-demand fetch.
		const resume = joinPage(page.resume, page);
		const bootSeeds = new Set(bootRoots);
		let bootBounded =
			resume !== 'unknown' && [...files].every((file) => !demand.get(file)!.replaced);
		const seedSymbol = (file: string, symbolId: string) => {
			const id = byVirtualId.get(symbolVirtualModuleId(file, symbolId));
			if (id) bootSeeds.add(id);
			else bootBounded = false;
		};
		for (const file of files)
			for (const symbolId of demand.get(file)!.landingSymbols) seedSymbol(file, symbolId);
		if (resume !== 'unknown')
			for (const [owner, symbolIds] of resume.symbols)
				for (const symbolId of symbolIds) seedSymbol(owner, symbolId);
		const consumers: InteractionConsumer[] = [
			{
				key: 'boot',
				kind: 'boot',
				modules: bootBounded
					? useClosure(route, reach, bootSeeds, {})
					: useClosure(route, reach, bootRoots),
			},
			...(renderRoots.length
				? [
						{
							key: 'render',
							kind: 'render' as const,
							modules: useClosure(route, reach, renderRoots),
						},
					]
				: []),
		];
		for (const file of [...files].sort()) {
			const merged = demand.get(file)!;
			const fileSymbols = symbolsByFile.get(file) ?? [];
			for (const [actionKey, action] of [...merged.actions].sort(([a], [b]) =>
				a < b ? -1 : a > b ? 1 : 0,
			)) {
				const firstUse = merged.replaced ? null : action.firstUse;
				// Resume start runs page-wide, so every bounded control joins what it runs.
				const joined = firstUse
					? joinPage(
							[...firstUse.map((reach) => ({ file, reach })), ...page.resume],
							page,
						)
					: null;
				if (action.unknown || joined === 'unknown') {
					consumers.push({
						key: `action:${display(file, input.root)}#${actionKey}`,
						kind: 'action',
						conservative: 'unknown-first-use',
						modules: landingReach,
					});
					continue;
				}
				const seeds = new Set<string>();
				let conservative: string | undefined;
				const widen = (reason: string) => {
					conservative ??= reason;
					for (const id of fileSymbols) seeds.add(id);
				};
				for (const [owner, symbolIds] of joined?.symbols ?? []) {
					for (const symbolId of symbolIds) {
						const id = byVirtualId.get(symbolVirtualModuleId(owner, symbolId));
						if (id) seeds.add(id);
						else if (owner === file) widen('unresolved-symbol');
						else {
							conservative ??= 'unresolved-symbol';
							for (const known of symbolsByFile.get(owner) ?? []) seeds.add(known);
						}
					}
				}
				for (const recordId of action.recordIds) {
					const symbolIds = merged.records.get(recordId);
					if (!symbolIds) {
						widen('unlisted-record');
						continue;
					}
					for (const symbolId of symbolIds) {
						const id = byVirtualId.get(symbolVirtualModuleId(file, symbolId));
						if (id) seeds.add(id);
						else widen('unresolved-symbol');
					}
				}
				const runtimeIds = new Set([
					...action.runtimeModuleIds,
					...(joined?.runtimeModuleIds ?? []),
				]);
				if (
					merged.replaced ||
					(!firstUse &&
						[...action.recordKinds].some(
							(kind) =>
								CARRIES_UNLISTED_RECORDS[
									kind as keyof typeof CARRIES_UNLISTED_RECORDS
								],
						))
				) {
					widen('unlisted-records');
					for (const id of merged.unknownRecordModuleIds) runtimeIds.add(id);
				}
				for (const runtimeId of runtimeIds)
					for (const id of byRuntimeId.get(runtimeId) ?? []) seeds.add(id);
				consumers.push({
					key: `action:${display(file, input.root)}#${actionKey}`,
					kind: 'action',
					...(conservative ? { conservative } : {}),
					...([...action.runtimeModuleIds].some((id) => LEAN_DISPATCH_MODULE_IDS.has(id))
						? { lean: true }
						: {}),
					modules: useClosure(route, reach, seeds, { runtimeIds }),
				});
			}
		}
		result.push({ route, consumers });
	}
	return result;
}

export function interactionClosuresAsset(input: {
	readonly root: string;
	readonly closures: readonly RouteInteractionClosures[];
	readonly packs: ReadonlyMap<string, string>;
	readonly partition: 'tiers' | 'unsplit:entry-roots';
	// Output files an import of each module fetches, when the asset is written after rendering.
	readonly chunkOf?: ReadonlyMap<string, readonly string[]>;
}): string {
	const filesFor = (route: RouteInteractionClosures, render: boolean) => {
		const files = new Set<string>();
		for (const consumer of route.consumers)
			if ((consumer.kind === 'render') === render)
				for (const id of consumer.modules)
					for (const file of input.chunkOf?.get(id) ?? []) files.add(file);
		return [...files].sort();
	};
	const packs = new Map<string, string[]>();
	for (const [id, name] of input.packs) push(packs, name, display(id, input.root));
	return JSON.stringify({
		version: MARKLESS_INTERACTION_CLOSURES_VERSION,
		partition: input.partition,
		routes: input.closures.map((route) => ({
			route: route.route,
			...(route.fallback ? { fallback: route.fallback } : {}),
			...(input.chunkOf
				? { files: { firstUse: filesFor(route, false), render: filesFor(route, true) } }
				: {}),
			consumers: route.consumers.map((consumer) => ({
				key: consumer.key,
				kind: consumer.kind,
				...(consumer.conservative ? { conservative: consumer.conservative } : {}),
				...(consumer.lean ? { lean: true } : {}),
				modules: consumer.modules.map((id) => display(id, input.root)).sort(),
			})),
		})),
		packs: Object.fromEntries(
			[...packs]
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([name, ids]) => [name, ids.sort()]),
		),
		...(input.chunkOf
			? {
					packFiles: Object.fromEntries(
						[...packFiles(input.packs, input.chunkOf)].sort(([a], [b]) =>
							a < b ? -1 : a > b ? 1 : 0,
						),
					),
				}
			: {}),
	});
}

function packFiles(
	packs: ReadonlyMap<string, string>,
	chunkOf: ReadonlyMap<string, readonly string[]>,
): Map<string, string[]> {
	const files = new Map<string, Set<string>>();
	for (const [id, name] of packs)
		for (const file of chunkOf.get(id) ?? []) addTo(files, name, file);
	return new Map([...files].map(([name, set]) => [name, [...set].sort()]));
}

// Fail closed: nothing is pruned when an action carries records its map does not enumerate.
function routeUndemandedRuntime(
	maps: ReadonlyArray<RuntimeDemandMapManifest | undefined>,
	moduleIds: Iterable<string>,
): Set<string> {
	const named = new Set<string>();
	for (const map of maps) {
		if (!map) return new Set();
		for (const action of [...map.actions, ...(map.armActions ?? [])]) {
			if (
				!map.nestedRecordModuleIds &&
				action.recordKinds.some(
					(kind) =>
						CARRIES_UNLISTED_RECORDS[kind as keyof typeof CARRIES_UNLISTED_RECORDS],
				)
			)
				return new Set();
			if (action.firstUse && action.firstUse !== 'unknown')
				for (const id of action.firstUse.runtimeModuleIds) named.add(id);
		}
		const resume = map.firstUsePage?.resume;
		if (resume === 'unknown') return new Set();
		for (const id of resume?.runtimeModuleIds ?? []) named.add(id);
	}
	const undemanded = undemandedRuntimeModules({ demandMaps: maps, moduleIds });
	for (const id of undemanded) {
		const runtimeId = runtimeModuleIdFromOrigin(id.split('?')[0]!);
		if (runtimeId && named.has(runtimeId)) undemanded.delete(id);
	}
	return undemanded;
}

function mergeDemand(sources: Iterable<InteractionDemandSource>): Map<string, MergedDemand> {
	const merged = new Map<string, MergedDemand>();
	for (const { source, map } of sources) {
		const file = source.split('?')[0]!;
		let entry = merged.get(file);
		if (!entry) {
			entry = {
				missing: false,
				replaced: false,
				records: new Map(),
				landingSymbols: new Set(),
				actions: new Map(),
				unknownRecordModuleIds: new Set(),
				page: {
					resume: [],
					pageSpaceReaders: new Map(),
					passedProps: [],
					callbackSlots: new Map(),
				},
			};
			merged.set(file, entry);
		}
		if (!map) {
			entry.missing = true;
			continue;
		}
		mergePage(entry.page, map.firstUsePage);
		if (map.recordKinds.some((kind) => kind.replaced)) entry.replaced = true;
		for (const record of map.payloadRecords) {
			const symbols = entry.records.get(record.recordId) ?? new Set<string>();
			for (const id of record.symbolIds ?? []) symbols.add(id);
			entry.records.set(record.recordId, symbols);
			if (RUNS_WITHOUT_INPUT[record.kind])
				for (const id of record.symbolIds ?? []) entry.landingSymbols.add(id);
		}
		for (const action of [...map.actions, ...(map.armActions ?? [])]) {
			const key = `${action.hostNodeId}:${action.eventName}`;
			const existing = entry.actions.get(key) ?? {
				hostNodeId: action.hostNodeId,
				eventName: action.eventName,
				recordKinds: new Set<string>(),
				recordIds: new Set<string>(),
				runtimeModuleIds: new Set<string>(),
				firstUse: action.firstUse ? [] : null,
				unknown: false,
			};
			if (action.firstUse === 'unknown') existing.unknown = true;
			else if (!action.firstUse) existing.firstUse = null;
			else existing.firstUse?.push(action.firstUse);
			for (const kind of action.recordKinds) existing.recordKinds.add(kind);
			for (const id of action.payloadRecordIds) existing.recordIds.add(id);
			for (const id of action.runtimeModuleIds) existing.runtimeModuleIds.add(id);
			entry.actions.set(key, existing);
		}
		for (const id of map.unknownRecordModuleIds) entry.unknownRecordModuleIds.add(id);
	}
	return merged;
}

function mergePage(page: FilePage, published: RuntimeDemandMapManifest['firstUsePage']) {
	// A map that publishes nothing for its page leaves resume start unbounded.
	if (!published || published.resume === 'unknown') page.resume = 'unknown';
	else if (page.resume !== 'unknown') page.resume.push(published.resume);
	for (const reader of published?.pageSpaceReaders ?? []) {
		const reaches = page.pageSpaceReaders.get(reader.graphNodeId) ?? [];
		reaches.push(reader.reach);
		page.pageSpaceReaders.set(reader.graphNodeId, reaches);
	}
	page.passedProps.push(...(published?.passedProps ?? []));
	for (const { slot, prop } of published?.callbackSlots ?? [])
		addTo(page.callbackSlots, slot, prop);
}

function pageIndex(files: Iterable<string>, demand: ReadonlyMap<string, MergedDemand>): PageIndex {
	const index: PageIndex = {
		resumeUnknown: false,
		resume: [],
		readers: new Map(),
		passed: [],
		slots: new Map(),
	};
	let resumeUnknown = false;
	for (const file of files) {
		const { page } = demand.get(file)!;
		if (page.resume === 'unknown') resumeUnknown = true;
		else for (const reach of page.resume) index.resume.push({ file, reach });
		for (const [graphNodeId, reaches] of page.pageSpaceReaders)
			for (const reach of reaches) push(index.readers, graphNodeId, { file, reach });
		for (const prop of page.passedProps) index.passed.push({ file, prop });
		for (const [slot, props] of page.callbackSlots)
			for (const prop of props) push(index.slots, slot, { file, prop });
	}
	return { ...index, resumeUnknown };
}

// Closes a first use over the page: what every module re-runs for the page-space cells it
// writes, and what the modules that compose it pass for the values it calls.
function joinPage(
	start: ReadonlyArray<OwnedReach>,
	page: PageIndex,
):
	| { readonly symbols: Map<string, Set<string>>; readonly runtimeModuleIds: Set<string> }
	| 'unknown' {
	if (page.resumeUnknown) return 'unknown';
	const symbols = new Map<string, Set<string>>();
	const runtimeModuleIds = new Set<string>();
	const joinedCells = new Set<string>();
	const joinedProps = new Set<string>();
	const pending = [...start];
	while (pending.length) {
		const { file, reach } = pending.pop()!;
		for (const id of reach.symbolIds) addTo(symbols, file, id);
		for (const foreign of reach.foreign ?? [])
			for (const id of foreign.symbolIds) addTo(symbols, foreign.file, id);
		for (const id of reach.runtimeModuleIds) runtimeModuleIds.add(id);
		for (const graphNodeId of reach.pageSpaceWrites ?? []) {
			if (joinedCells.has(graphNodeId)) continue;
			joinedCells.add(graphNodeId);
			for (const reader of page.readers.get(graphNodeId) ?? []) {
				if (reader.reach === 'unknown') return 'unknown';
				pending.push({ file: reader.file, reach: reader.reach });
			}
		}
		const props = (reach.calls ?? []).flatMap((call) =>
			'slot' in call
				? (page.slots.get(call.slot) ?? [])
				: [{ file: call.file ?? file, prop: call.prop }],
		);
		for (const called of props) {
			const key = `${called.file}\0${called.prop}`;
			if (joinedProps.has(key)) continue;
			joinedProps.add(key);
			for (const { file: publisher, prop: passed } of page.passed) {
				const receiver = passed.file === null ? null : (passed.file ?? publisher);
				if (receiver !== null && receiver !== called.file) continue;
				if (
					passed.prop !== undefined
						? passed.prop !== called.prop
						: (passed.excludeNames ?? []).includes(called.prop)
				)
					continue;
				if (passed.reach === 'unknown') return 'unknown';
				pending.push({
					file: publisher,
					reach:
						passed.reach === 'same-prop'
							? {
									symbolIds: [],
									runtimeModuleIds: [],
									calls: [{ prop: called.prop }],
								}
							: passed.reach,
				});
			}
		}
	}
	return { symbols, runtimeModuleIds };
}

function isSymbolModule(id: string): boolean {
	return symbolVirtualModuleSourceFile(normalizeVirtualId(id)) !== null;
}

function display(id: string, root: string): string {
	return rootRelativeId(normalizeVirtualId(id), root || undefined);
}

function addTo<K, V>(map: Map<K, Set<V>>, key: K, value: V) {
	const values = map.get(key);
	if (values) values.add(value);
	else map.set(key, new Set([value]));
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
	const values = map.get(key);
	if (values) values.push(value);
	else map.set(key, [value]);
}

// File lists sort by name when written, but content-hash renaming changes the names after that.
export function resortInteractionClosuresFiles(bundle: Record<string, unknown>): void {
	const asset = bundle[MARKLESS_INTERACTION_CLOSURES] as
		| { readonly type?: string; source?: string | Uint8Array }
		| undefined;
	if (asset?.type !== 'asset' || typeof asset.source !== 'string') return;
	const parsed = JSON.parse(asset.source) as {
		readonly routes?: ReadonlyArray<{ readonly files?: Record<string, string[]> }>;
		readonly packFiles?: Record<string, string[]>;
	};
	for (const route of parsed.routes ?? [])
		for (const files of Object.values(route.files ?? {})) files.sort();
	for (const files of Object.values(parsed.packFiles ?? {})) files.sort();
	asset.source = JSON.stringify(parsed);
}
