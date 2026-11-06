import { ASYNC_BOUNDARY_ARM } from '@markless/serializer/async-boundary-arm';
import { serializeGraphValue } from '../../serializer/src/value.ts';
import type { ResumeCacheContext } from './fns/resume-cache.ts';
import type { asyncPlanes } from './reconcile-plane-slot.ts';
import { boundaryArmRecordSet } from './resume-arm-records.ts';
import {
	boundaryAsyncRecords,
	resumeCacheDependencyKey,
	resumeCacheExcludes,
	type ResumeCacheEntry,
} from './resume-cache-key.ts';
import { RESUME_CACHE_KEY_PREFIX } from './resume-cache-storage-key.ts';

declare const __MARKLESS_DEV_ENABLED__: boolean;

type CacheHook = NonNullable<typeof asyncPlanes.cache>;
type Wiring = Parameters<CacheHook>[0];
type Boundary = Parameters<CacheHook>[1];
type Snapshot = {
	readonly status?: unknown;
	readonly key?: unknown;
	readonly value?: unknown;
	readonly action?: boolean;
};

// Byte pressure, not freshness: one entry may take this much, and every entry together this much.
export const RESUME_CACHE_ENTRY_CHARS = 64 * 1024;
export const RESUME_CACHE_BUDGET_CHARS = 1024 * 1024;
// The keys written, oldest first, with their sizes.
const INDEX_KEY = RESUME_CACHE_KEY_PREFIX;

/** Writes each settled boundary's seed. Runs at idle; a failure is a missing entry, never a rendering change. */
export async function captureSettled(
	batch: ReadonlyMap<Boundary, Wiring>,
	context: ResumeCacheContext,
): Promise<void> {
	for (const [boundary, wiring] of batch) {
		try {
			const skipped = await captureBoundary(wiring, boundary, context);
			if (skipped) devLog(`did not keep ${boundary.id}: ${skipped}`);
		} catch (error) {
			devLog(`did not keep ${boundary.id}: ${(error as Error)?.message ?? error}`);
		}
	}
}

async function captureBoundary(
	wiring: Wiring,
	boundary: Boundary,
	context: ResumeCacheContext,
): Promise<string | undefined> {
	const state = wiring.state;
	const name = context.key(wiring, boundary.id);
	const storage = context.storage();
	if (!state || !name || !storage) return undefined;
	const records = boundaryAsyncRecords(state, boundary.asyncReads);
	if (!records) return 'not keyed by its own values';
	if (resumeCacheExcludes(context.exclude, records)) return 'excluded';
	const snapshots = records.map((record) => wiring.graph.read(record.graphNodeId, []) as Snapshot);
	// Only settled, fulfilled values are kept; a revalidation in flight leaves the previous entry in place.
	if (snapshots.some((snapshot) => snapshot?.status !== 'fulfilled')) return undefined;
	// A reload must never replay what a click asked for, such as a save.
	if (snapshots.some((snapshot) => snapshot.action)) return 'a user action fetched it';
	const k = resumeCacheDependencyKey(state, boundary.asyncReads, (graphNodeId, path) =>
		wiring.graph.read(graphNodeId, path),
	);
	if (k === undefined) return 'not keyed by its own values';
	const computed = [];
	for (const [at, snapshot] of snapshots.entries()) {
		const key = serializeGraphValue(snapshot.key);
		const value = serializeGraphValue(snapshot.value);
		if (!key.ok || !value.ok) return 'its value does not serialize';
		computed.push({
			graphNodeId: records[at]!.graphNodeId,
			snapshot: { status: 'fulfilled', version: 1, key: key.payload, value: value.payload },
		});
	}
	const arm = await settledArm(wiring, boundary);
	if (typeof arm === 'string') return arm;
	const entry: ResumeCacheEntry = {
		k,
		s: { cells: [], computed } as unknown as ResumeCacheEntry['s'],
		h: arm.html,
		a: arm.armRecords,
	};
	const json = JSON.stringify(entry);
	if (json.length > RESUME_CACHE_ENTRY_CHARS) return `over the ${RESUME_CACHE_ENTRY_CHARS}-character entry cap`;
	return write(storage, name, json);
}

// The settled @try arm a served page fills its pending range with, rendered the way a settle commit renders it.
// Only an arm that is plain markup over the page's own values is kept: one with async blocks or state of its own has no proven seed.
async function settledArm(
	wiring: Wiring,
	boundary: Boundary,
): Promise<{ readonly html: string; readonly armRecords: unknown } | string> {
	if (boundary.composedGraphProps || boundary.composedInstancePath) return 'its arm is composed from a parent';
	if (wiring.commitArm && wiring.renderAsyncBoundary) {
		const rendered = await wiring.renderAsyncBoundary(boundary.id, 'fulfilled', wiring.graph);
		return plainArm(wiring, rendered.html, boundaryArmRecordSet(rendered.armRecords), rendered);
	}
	if (!boundary.updateSymbolId) return 'it has no settle renderer';
	const update = (await (await wiring.loadSymbol(boundary.updateSymbolId))({
		graph: wiring.graph,
		status: 'fulfilled',
		element: wiring.root,
		getElementHandle: wiring.elementHandles.get,
		asyncBoundary: boundary,
	})) as {
		readonly arm?: unknown;
		readonly html?: unknown;
		readonly armRecords?: unknown;
		readonly cells?: ReadonlyArray<unknown>;
		readonly computed?: ReadonlyArray<{ readonly graphNodeId?: string }>;
	} | null;
	if (update?.arm !== ASYNC_BOUNDARY_ARM.try) return 'it settles to another arm';
	return plainArm(wiring, update.html, boundaryArmRecordSet(update.armRecords), update);
}

function plainArm(
	wiring: Wiring,
	html: unknown,
	armRecords: ReturnType<typeof boundaryArmRecordSet>,
	update: Parameters<typeof ownsNoState>[1],
): { readonly html: string; readonly armRecords: unknown } | string {
	if (typeof html !== 'string' || !armRecords) return 'its arm did not render';
	if (armRecords.asyncBoundaries?.length) return 'its arm holds async blocks of its own';
	if (!ownsNoState(wiring, update)) return 'its arm brings state of its own';
	return { html, armRecords };
}

// An arm whose components bring their own state needs that state in the seed too, so a served page does not fill it.
function ownsNoState(
	wiring: Wiring,
	update: {
		readonly cells?: ReadonlyArray<unknown>;
		readonly computed?: ReadonlyArray<{ readonly graphNodeId?: string }>;
	},
): boolean {
	return (
		!update.cells?.length &&
		(update.computed ?? []).every((record) =>
			wiring.state?.computed.some((known) => known.graphNodeId === record.graphNodeId),
		)
	);
}

// Least recently written entries make room first; a storage that refuses even an empty budget keeps nothing.
function write(storage: Storage, name: string, json: string): string | undefined {
	let index: Array<[string, number]>;
	try {
		index = (JSON.parse(storage.getItem(INDEX_KEY) ?? '[]') as Array<[string, number]>).filter(
			([key]) => key !== name,
		);
	} catch {
		index = [];
	}
	const evict = () => {
		const [oldest] = index.shift()!;
		storage.removeItem(oldest);
	};
	while (index.length && index.reduce((total, [, size]) => total + size, json.length) > RESUME_CACHE_BUDGET_CHARS)
		evict();
	for (;;) {
		try {
			storage.setItem(name, json);
			index.push([name, json.length]);
			storage.setItem(INDEX_KEY, JSON.stringify(index));
			return undefined;
		} catch {
			if (!index.length || index.at(-1)![0] === name) {
				try {
					storage.removeItem(name);
				} catch {}
				return 'storage is full or unavailable';
			}
			evict();
		}
	}
}

function devLog(message: string): void {
	if (typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__)
		console.info(`[markless] resume cache ${message}`);
}
