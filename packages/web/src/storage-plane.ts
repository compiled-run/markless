import {
	STORAGE_RENDER_CONTEXT_READER,
	STORAGE_SLOT_SYMBOL_KEY,
	storageAttributeName,
	storageCookieAssignment,
	storageCookieName,
	storageSlotEntryKeyFromGraphNodeId,
} from '../../serializer/src/storage-slot.ts';
import type { ProtocolStatePayload } from '@markless/serializer/protocol';
import type { RuntimeGraph } from '@markless/runtime';
import type { PrerenderDataDefinition, PrerenderDataSurface } from './prerender/evaluator.ts';

export type StoragePlane = {
	readonly dispose: () => void;
};

type StorageRecords = NonNullable<ProtocolStatePayload['storage']>;
type DecodedStateCell = {
	readonly graphNodeId: string;
	readonly value: unknown;
	readonly readInitializer?: () => unknown;
};

// Load contract (progressive execution): the resume runtime imports this module
// only when the payload actually declares storage cells — see the
// `hasStorageCells` gate in resume-runtime.ts. That gate reads the same signal
// the compiler uses: protocol-state omits the `storage` field entirely when a
// view has no cells, and runtime-demand-map's `storageRequiresFullResume` keys
// off that same emptiness to decide a page needs the full resume path. So an
// empty list is authoritative — no storage cell can appear on that page later,
// and loading this module there would be a fetch the page can never use.
//
// The gate is load-time only, never behavior-changing: on a page that does have
// cells the plane is awaited before the start wiring runs, so its driver
// subscriptions see every write a handler makes. The resume runtime commits the
// saved values itself, once everything derived from them is subscribed.

export function createStoragePlane(input: {
	readonly graph: RuntimeGraph;
	readonly state?: ProtocolStatePayload;
}): StoragePlane {
	const records = input.state?.storage ?? [];
	const releases = records.map((record) =>
		input.graph.subscribe({
			id: `storage:${record.graphNodeId}`,
			graphNodeId: record.graphNodeId,
			run(value) {
				try {
					globalThis.localStorage.setItem(record.key, String(value));
				} catch {}
				try {
					globalThis.document.cookie = storageCookieAssignment(
						record.key,
						String(value),
						globalThis.location.protocol === 'https:',
					);
				} catch {}
				setStorageAttribute(record.key, value);
				// A client navigation wakes the next page from this slot, so it must hold the live value.
				const slot = storageSlot();
				if (slot) slot[storageSlotEntryKeyFromGraphNodeId(record.graphNodeId)] = String(value);
			},
		}),
	);

	return {
		dispose() {
			for (const release of releases.splice(0)) release();
		},
	};
}

// Wake-time slot override. Lives here, not in payload-graph-construct, because
// payload-graph-construct is in every resuming page's static closure while this
// module is imported only when the payload actually declares storage cells (the
// same `hasStorageCells` gate documented above). A storage-free page therefore
// never fetches or executes any of this.
export function applyStorageReadInitializers(
	cells: ReadonlyArray<DecodedStateCell>,
	storage: StorageRecords,
): DecodedStateCell[] {
	const slot = storageSlot();
	return cells.map((cell) => {
		const record = storage.find((entry) => entry.graphNodeId === cell.graphNodeId);
		if (!record) return cell;
		const slotKey = storageSlotEntryKeyFromGraphNodeId(record.graphNodeId);
		if (slot && Object.hasOwn(slot, slotKey)) {
			// Keep the cell at its SSR fallback value so the mounted DOM matches;
			// deliver the seeded value through a read initializer, which marks the
			// cell dirty on first read and reconciles the SSR text to the seeded
			// value. Reads from the slot (already populated by the seed script), so
			// no extra driver read occurs. Setting cell.value directly would be
			// Object.is-suppressed against the SSR-rendered text and never
			// reconcile — the warm/write-remount bug.
			const seeded = slot[slotKey];
			return {
				...cell,
				readInitializer() {
					return seeded;
				},
			};
		}
		if (slot) return cell;
		const fallback = cell.value;
		return {
			...cell,
			readInitializer: () => readSavedStorageValue(record.key) ?? fallback,
		};
	});
}

function storageSlot(): Record<string, unknown> | undefined {
	return (globalThis as typeof globalThis & Record<symbol, Record<string, unknown> | undefined>)[
		Symbol.for(STORAGE_SLOT_SYMBOL_KEY)
	];
}

function setStorageAttribute(key: string, value: unknown): void {
	try {
		globalThis.document.documentElement.setAttribute(storageAttributeName(key), String(value));
	} catch {}
}

/**
 * The value a visitor saved under a storage() key, read the way the page head script reads it:
 * the cookie first, then `localStorage`. A saved value also goes on the `<html>` data attribute.
 */
export function readSavedStorageValue(key: string): string | undefined {
	let value: string | null | undefined;
	try {
		const name = `${storageCookieName(key)}=`;
		const cookie = globalThis.document.cookie.split('; ').find((part) => part.startsWith(name));
		if (cookie) value = decodeURIComponent(cookie.slice(name.length));
	} catch {}
	if (value === undefined)
		try {
			value = globalThis.localStorage.getItem(key);
		} catch {}
	if (value == null) return undefined;
	setStorageAttribute(key, value);
	return value;
}

/** What a client render hands a compiled render body, so each storage() cell renders its saved value. */
export const savedStorageRenderContext = { [STORAGE_RENDER_CONTEXT_READER]: readSavedStorageValue };

/** The surface with each storage() cell starting from its saved value, in this module and the ones it imports. */
export function withSavedStorageValues(
	surface: PrerenderDataSurface,
	seeded = new Map<PrerenderDataSurface, PrerenderDataSurface>(),
): PrerenderDataSurface {
	const known = seeded.get(surface);
	if (known) return known;
	const copy: { -readonly [K in keyof PrerenderDataSurface]: PrerenderDataSurface[K] } = { ...surface };
	seeded.set(surface, copy);
	copy.components = Object.fromEntries(
		Object.entries(surface.components).map(([name, definition]) => [name, withSavedCells(definition)]),
	);
	copy.imports = Object.fromEntries(
		Object.entries(surface.imports).map(([source, imported]) => [
			source,
			withSavedStorageValues(imported, seeded),
		]),
	);
	return copy;
}

function withSavedCells(definition: PrerenderDataDefinition): PrerenderDataDefinition {
	const saved = new Map<string, string>();
	for (const record of definition.state.storage ?? []) {
		const value = readSavedStorageValue(record.key);
		if (value !== undefined) saved.set(record.graphNodeId, value);
	}
	if (saved.size === 0) return definition;
	return {
		...definition,
		initialValues: definition.initialValues?.map((initial) =>
			saved.has(initial.graphNodeId)
				? { graphNodeId: initial.graphNodeId, value: { kind: 'constant', value: saved.get(initial.graphNodeId) } }
				: initial,
		),
	};
}
