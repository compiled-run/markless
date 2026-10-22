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
import {
	isCompilerStatefulModuleId,
	isMarklessRuntimeModule,
	isRouteNavigationSourceRequest,
	isSymbolOnlySourceRequest,
	normalizeVirtualId,
} from '../virtual-ids.ts';

// An import() into plain script the author wrote: code they chose to fetch when reached, never first-use code.
function isAuthoredLazyImport(id: string): boolean {
	return (
		!isCompilerStatefulModuleId(id) &&
		!isMarklessRuntimeModule(id) &&
		!/^\0|^virtual:|\.mdx(?:$|\?)|[\\/]@markless[\\/]/.test(id) &&
		runtimeModuleIdFromOrigin(id.split('?')[0]!) === undefined
	);
}

export const MARKLESS_INTERACTION_CLOSURES_VERSION = 2;

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

function isLeanAction(runtimeModuleIds: Iterable<string>): boolean {
	return [...runtimeModuleIds].some((id) => LEAN_DISPATCH_MODULE_IDS.has(id));
}

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
	// Symbols and runtime of the records whose code can run before any input.
	readonly landingSymbols: Set<string>;
	readonly landingRuntimeModuleIds: Set<string>;
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
			// The same, over only the sources that serve it on a lean dispatch path.
			lean?: { firstUse: RuntimeDemandMapFirstUse[] | null; unknown: boolean };
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
	// Landings stream every async boundary's arm, so one settles in the browser only when a control's writes reach its reads.
	readonly landingArmsServed?: boolean;
}): RouteInteractionClosures[] {
	const { modules } = input;
	const sources = [...input.demand];
	const demand = mergeDemand(sources, input.landingArmsServed === true);
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

	// Many controls share one closure; holding each list once keeps a large site's closures in memory once.
	const sharedClosures = new Map<string, string[]>();
	// Static and dynamic imports, never into another route. When bounded, a dynamic import is also
	// skipped when demand data names who loads it: the file's own symbols (its map bounds them;
	// another file's resolver may not) and, given a runtime set, known runtime outside it.
	const useClosure = (
		route: string,
		// What the route can load at all; a demand map may name runtime this route never imports.
		reach: ReadonlySet<string>,
		seeds: Iterable<string>,
		bound?: { readonly runtimeIds?: ReadonlySet<string> },
		// Symbols demand data names in a composed file that is also a route of its own: walked into that route.
		named?: ReadonlySet<string>,
	): string[] => {
		const seen = new Set<string>();
		// The other route a walk entered through a named symbol, if any.
		const pending: Array<readonly [string, string | undefined]> = [...seeds].map(
			(id) => [id, undefined] as const,
		);
		while (pending.length) {
			const [id, via] = pending.pop()!;
			if (seen.has(id)) continue;
			const owner = routeOf.get(id);
			const inside = reach.has(id)
				? via
				: named?.has(id) && owner !== undefined
					? owner
					: via !== undefined && (owner === undefined || owner === via)
						? via
						: null;
			if (inside === null) continue;
			const module = modules.get(id);
			if (!module) continue;
			seen.add(id);
			// That file's symbol resolver is how the page loads the named symbol.
			if (inside !== via && module.source)
				for (const sibling of siblings.get(module.source) ?? [])
					if (isSymbolOnlySourceRequest(sibling)) pending.push([sibling, inside]);
			for (const dependency of module.dependencies) pending.push([dependency, inside]);
			for (const target of module.dynamicDependencies ?? []) {
				if (routeOf.has(target) && routeOf.get(target) !== (inside ?? route)) continue;
				if (!routeOf.has(target) && isAuthoredLazyImport(target)) continue;
				if (!bound) {
					pending.push([target, inside]);
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
				pending.push([target, inside]);
			}
		}
		const ids = [...seen].sort();
		const key = ids.join('\0');
		const shared = sharedClosures.get(key);
		if (shared) return shared;
		sharedClosures.set(key, ids);
		return ids;
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
		// A first input on a full-dispatch control resumes the whole page; a lean one runs only its own path,
		// so runtime the resume module imports for escalation is first-use code only where something names it.
		const leanOnly =
			resume !== 'unknown' &&
			[...files].every((file) => {
				const merged = demand.get(file)!;
				return (
					merged.landingSymbols.size === 0 &&
					merged.landingRuntimeModuleIds.size === 0 &&
					[...merged.actions.values()].every(
						(action) =>
							isLeanAction(action.runtimeModuleIds) &&
							!(action.lean ?? action).unknown,
					)
				);
			});
		const bootBound = leanOnly ? { runtimeIds: new Set(resume.runtimeModuleIds) } : {};
		const consumers: InteractionConsumer[] = [
			{
				key: 'boot',
				kind: 'boot',
				modules: bootBounded
					? useClosure(route, reach, bootSeeds, bootBound, bootSeeds)
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
				const lean = isLeanAction(action.runtimeModuleIds);
				// A client-render variant of the file dispatches it in full; the landing serves it lean.
				const served = (lean && action.lean) || action;
				const firstUse = merged.replaced ? null : served.firstUse;
				// Resume start runs page-wide, so every bounded control joins what it runs.
				const joined = firstUse
					? joinPage(
							[...firstUse.map((reach) => ({ file, reach })), ...page.resume],
							page,
						)
					: null;
				if (served.unknown || joined === 'unknown') {
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
				// A lean action also demands the full runtime it escalates to; its first use names only what it runs.
				const runtimeIds = new Set([
					...(lean && joined ? [] : action.runtimeModuleIds),
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
					...(lean ? { lean: true } : {}),
					modules: useClosure(route, reach, seeds, { runtimeIds }, seeds),
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
	// Handlers × closure size outgrew V8's longest string, so each module and each distinct closure is written once.
	const displayed = new Map<string, string>();
	for (const route of input.closures)
		for (const consumer of route.consumers)
			for (const id of consumer.modules)
				if (!displayed.has(id)) displayed.set(id, display(id, input.root));
	const modules = [...new Set(displayed.values())].sort();
	const moduleIndex = new Map(modules.map((id, index) => [id, index]));
	const closureSets: number[][] = [];
	const closureIndex = new Map<readonly string[], number>();
	const closureByKey = new Map<string, number>();
	const closureOf = (ids: readonly string[]) => {
		const known = closureIndex.get(ids);
		if (known !== undefined) return known;
		const indexes = [...new Set(ids.map((id) => moduleIndex.get(displayed.get(id)!)!))].sort(
			(a, b) => a - b,
		);
		const key = indexes.join(',');
		let index = closureByKey.get(key);
		if (index === undefined) {
			index = closureSets.length;
			closureSets.push(indexes);
			closureByKey.set(key, index);
		}
		closureIndex.set(ids, index);
		return index;
	};
	return JSON.stringify({
		version: MARKLESS_INTERACTION_CLOSURES_VERSION,
		partition: input.partition,
		modules,
		closures: closureSets,
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
				closure: closureOf(consumer.modules),
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

function mergeDemand(
	sources: Iterable<InteractionDemandSource>,
	landingArmsServed: boolean,
): Map<string, MergedDemand> {
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
				landingRuntimeModuleIds: new Set(),
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
		mergePage(entry.page, map.firstUsePage, landingArmsServed);
		if (map.recordKinds.some((kind) => kind.replaced)) entry.replaced = true;
		for (const record of map.payloadRecords) {
			const symbols = entry.records.get(record.recordId) ?? new Set<string>();
			entry.records.set(record.recordId, symbols);
			if (landingArmsServed && record.kind === 'async-boundary') continue;
			for (const id of record.symbolIds ?? []) symbols.add(id);
			if (!RUNS_WITHOUT_INPUT[record.kind]) continue;
			for (const id of record.symbolIds ?? []) entry.landingSymbols.add(id);
			for (const id of record.runtimeModuleIds) entry.landingRuntimeModuleIds.add(id);
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
			const views: Array<{ firstUse: RuntimeDemandMapFirstUse[] | null; unknown: boolean }> =
				[existing];
			if (isLeanAction(action.runtimeModuleIds))
				views.push(
					(existing.lean ??= { firstUse: action.firstUse ? [] : null, unknown: false }),
				);
			for (const view of views)
				if (action.firstUse === 'unknown') view.unknown = true;
				else if (!action.firstUse) view.firstUse = null;
				else view.firstUse?.push(action.firstUse);
			for (const kind of action.recordKinds) existing.recordKinds.add(kind);
			for (const id of action.payloadRecordIds) existing.recordIds.add(id);
			for (const id of action.runtimeModuleIds) existing.runtimeModuleIds.add(id);
			entry.actions.set(key, existing);
		}
		for (const id of map.unknownRecordModuleIds) entry.unknownRecordModuleIds.add(id);
	}
	return merged;
}

function mergePage(
	page: FilePage,
	published: RuntimeDemandMapManifest['firstUsePage'],
	landingArmsServed: boolean,
) {
	// A map that publishes nothing for its page leaves resume start unbounded.
	if (!published || published.resume === 'unknown') page.resume = 'unknown';
	else if (page.resume !== 'unknown') page.resume.push(published.resume);
	// A live runtime adopting a streamed arm runs the arm's bindings as soon as it lands.
	if (landingArmsServed && published?.streamedSettle && page.resume !== 'unknown')
		if (published.streamedSettle === 'unknown') page.resume = 'unknown';
		else page.resume.push(published.streamedSettle);
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

export type InteractionClosuresAssetView = {
	readonly version: number;
	readonly partition: string;
	readonly routes: ReadonlyArray<{
		readonly route: string;
		readonly fallback?: string;
		readonly files?: { readonly firstUse: readonly string[]; readonly render: readonly string[] };
		readonly consumers: ReadonlyArray<
			Omit<InteractionConsumer, 'modules'> & { readonly modules: readonly string[] }
		>;
	}>;
	readonly packs: Readonly<Record<string, readonly string[]>>;
	readonly packFiles?: Readonly<Record<string, readonly string[]>>;
};

/** The asset with every consumer's closure spelled out as module ids again. */
export function readInteractionClosuresAsset(source: string): InteractionClosuresAssetView {
	const parsed = JSON.parse(source) as Omit<InteractionClosuresAssetView, 'routes'> & {
		readonly modules: readonly string[];
		readonly closures: ReadonlyArray<readonly number[]>;
		readonly routes: ReadonlyArray<
			Omit<InteractionClosuresAssetView['routes'][number], 'consumers'> & {
				readonly consumers: ReadonlyArray<
					Omit<InteractionConsumer, 'modules'> & { readonly closure: number }
				>;
			}
		>;
	};
	const { modules, closures, ...rest } = parsed;
	return {
		...rest,
		routes: parsed.routes.map((route) => ({
			...route,
			consumers: route.consumers.map(({ closure, ...consumer }) => ({
				...consumer,
				modules: closures[closure]!.map((index) => modules[index]!),
			})),
		})),
	};
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
