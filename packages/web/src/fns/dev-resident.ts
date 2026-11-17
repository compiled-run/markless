import {
	joinFirstUse,
	type FirstUse,
	type FirstUseReach,
	type OwnedReach,
	type PassedProp,
} from './first-use-join.ts';
import { PACK_RESIDENT } from './resident-load.ts';

/** What the bundler knows of a named module: the demand map's id for runtime code, the symbol it holds, or the compiled file it is. */
type Facts = {
	readonly runtimeModuleId?: string;
	readonly symbolId?: string;
	readonly file?: string;
};
type Named = readonly [specifier: string, load: () => Promise<unknown>, facts?: Facts];
type Entry = {
	readonly key: string;
	readonly load: () => Promise<unknown>;
	// The compiled file that named it; empty for the runtime's own lazy modules.
	readonly owner: string;
	readonly facts: Facts;
};

/** What a handler load serves, from the demand map: its actions' first uses, and children whose bound symbols it loads. */
export type MarklessDevReach = {
	readonly file: string;
	readonly runtimeModuleIds: ReadonlyArray<string>;
	// Absent when the map cannot bound one of the actions.
	readonly actions?: ReadonlyArray<FirstUse>;
	readonly children?: ReadonlyArray<string>;
};

/** A compiled file's demand map, as the page join reads it. */
export type MarklessDevDemand = {
	readonly actions: ReadonlyArray<FirstUseReach>;
	readonly capabilityModuleIds: ReadonlyArray<string>;
	readonly page?: {
		readonly pageSpaceReaders: ReadonlyArray<{
			readonly graphNodeId: string;
			readonly reach: FirstUseReach;
		}>;
		readonly passedProps: ReadonlyArray<PassedProp>;
		readonly callbackSlots: ReadonlyArray<{ readonly slot: string; readonly prop: string }>;
	};
};

type Closure =
	| {
			readonly symbols: ReadonlyMap<string, ReadonlySet<string>>;
			readonly runtimeModuleIds: ReadonlySet<string>;
	  }
	| 'unknown';

const resident = new Map<string, unknown>();
const loading = new Map<string, Promise<void>>();
const named: Entry[] = [];
const demands = new Map<string, MarklessDevDemand>();

/**
 * Dev server only: a module the first interaction loaded answers in the caller's task, as packed code does in a build.
 * `scope` is the importer's URL, so the same relative specifier in two modules names two modules.
 */
export function marklessDevLoad<T>(
	scope: string,
	specifier: string,
	load: () => Promise<T>,
): Promise<T> {
	const key = `${scope} ${specifier}`;
	if (!resident.has(key)) return load();
	const mod = resident.get(key) as T;
	return Object.assign(Promise.resolve(mod), { [PACK_RESIDENT]: () => mod });
}

/** Names modules a write may reach; nothing loads until a handler does. */
export function marklessDevWarm(scope: string, owner: string, modules: ReadonlyArray<Named>): void {
	for (const [specifier, load, facts = {}] of modules)
		named.push({ key: `${scope} ${specifier}`, load, owner, facts });
}

/** Files the page has loaded publish their demand map, which a handler's first use joins over. */
export function marklessDevDemand(file: string, demand: MarklessDevDemand): void {
	demands.set(file, demand);
}

// The loaded modules' page facts, joined as the build's pack planner joins every page module's.
function pageIndex() {
	const readers = new Map<string, Array<{ file: string; reach: FirstUseReach }>>();
	const passed: Array<{ file: string; prop: PassedProp }> = [];
	const slots = new Map<string, Array<{ file: string; prop: string }>>();
	for (const [file, { page }] of demands) {
		for (const { graphNodeId, reach } of page?.pageSpaceReaders ?? [])
			(readers.get(graphNodeId) ?? readers.set(graphNodeId, []).get(graphNodeId)!).push({
				file,
				reach,
			});
		for (const prop of page?.passedProps ?? []) passed.push({ file, prop });
		for (const { slot, prop } of page?.callbackSlots ?? [])
			(slots.get(slot) ?? slots.set(slot, []).get(slot)!).push({ file, prop });
	}
	return { resumeUnknown: false, readers, passed, slots };
}

// What a handler load's first use runs over the page; the children it still waits on when they have not published.
function closure(
	reach: MarklessDevReach | undefined,
): Closure | { readonly waiting: ReadonlyArray<string> } {
	if (!reach?.actions) return 'unknown';
	const start: OwnedReach[] = reach.actions.map((use) => ({ file: reach.file, reach: use }));
	const waiting = (reach.children ?? []).filter((child) => !demands.has(child));
	if (waiting.length > 0) return { waiting };
	for (const child of reach.children ?? [])
		for (const use of demands.get(child)!.actions) {
			if (use === 'unknown') return 'unknown';
			start.push({ file: child, reach: use });
		}
	const joined = joinFirstUse(start, pageIndex());
	if (joined === 'unknown') return 'unknown';
	// A capability installs on its own trigger, so only the action that runs it names it.
	const capabilities = new Set(
		[...demands.values()].flatMap((demand) => demand.capabilityModuleIds),
	);
	const runtimeModuleIds = new Set(reach.runtimeModuleIds);
	for (const id of joined.runtimeModuleIds) if (!capabilities.has(id)) runtimeModuleIds.add(id);
	return { symbols: joined.symbols, runtimeModuleIds };
}

// Whether the first use runs this module; every module when it is unbounded.
function reaches(entry: Entry, runs: Closure, reach: MarklessDevReach | undefined): boolean {
	const { runtimeModuleId, symbolId, file } = entry.facts;
	// Runtime code stays bounded by the handler's own actions when the page join cannot bound its app code.
	if (runtimeModuleId !== undefined)
		return runs === 'unknown'
			? !reach || reach.runtimeModuleIds.includes(runtimeModuleId)
			: runs.runtimeModuleIds.has(runtimeModuleId);
	if (runs === 'unknown' || entry.owner === '') return true;
	// A composer's load of a child module serves that child's actions, wherever the composer lives.
	if (file !== undefined) return runs.symbols.has(file);
	return symbolId === undefined
		? runs.symbols.has(entry.owner)
		: runs.symbols.get(entry.owner)?.has(symbolId) === true;
}

/**
 * Loads the code a handler's first use runs, as the demand map bounds it and the page join closes it, and what those
 * modules name in turn; code the use never runs stays unloaded, as it does in a build. Without a reach, all of it loads.
 */
export async function marklessDevWarmed(reach?: MarklessDevReach): Promise<void> {
	const tried = new Set<string>();
	for (;;) {
		const runs = closure(reach);
		const pending = (entry: Entry) => !resident.has(entry.key) && !tried.has(entry.key);
		const due =
			typeof runs === 'object' && 'waiting' in runs
				? named.filter(
						(entry) => pending(entry) && runs.waiting.includes(entry.facts.file ?? ''),
					)
				: named.filter((entry) => pending(entry) && reaches(entry, runs, reach));
		if (due.length === 0) {
			if (typeof runs === 'object' && 'waiting' in runs)
				reach = { ...reach!, actions: undefined };
			else return;
			continue;
		}
		await Promise.all(
			due.map(({ key, load }) => {
				tried.add(key);
				let wait = loading.get(key);
				if (!wait) {
					wait = load().then(
						(mod) => void resident.set(key, mod),
						() => undefined,
					);
					// One that failed stays out of the resident set and loads again where it is used.
					void wait.finally(() => loading.delete(key));
					loading.set(key, wait);
				}
				return wait;
			}),
		);
	}
}
