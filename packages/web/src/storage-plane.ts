import {
	STORAGE_SLOT_MODE_DEFERRED,
	STORAGE_SLOT_MODE_KEY,
	STORAGE_SLOT_SYMBOL_KEY,
} from '../../serializer/src/storage-slot.ts';
import type { ProtocolStatePayload } from '@markless/serializer/protocol';
import type { RuntimeGraph } from '@markless/runtime';

export type StoragePlane = {
	readonly enableStorage: () => void;
	readonly dispose: () => void;
};

export function createStoragePlane(input: {
	readonly graph: RuntimeGraph;
	readonly state?: ProtocolStatePayload;
}): StoragePlane {
	const records = input.state?.storage ?? [];
	let enabled = storageMode() !== STORAGE_SLOT_MODE_DEFERRED;
	let activated = enabled;
	const releases = records.map((record) =>
		input.graph.subscribe({
			id: `storage:${record.graphNodeId}`,
			graphNodeId: record.graphNodeId,
			run(value) {
				if (!enabled) return;
				try {
					globalThis.localStorage.setItem(record.key, String(value));
				} catch {}
				setStorageAttribute(record.key, value);
			},
		}),
	);

	// Immediate mode: trigger each storage cell's read initializer now, so the
	// slot-seeded value is adopted into the graph and its dependents (the SSR
	// text bindings) reconcile from the fallback to the seeded value. Without
	// this the initializer only fires if some later read happens to touch the
	// cell, and an SSR-rendered binding never re-reads on its own — the
	// warm/write-remount bug. Reads go through the slot-backed initializer, so
	// no extra driver read occurs.
	if (enabled) {
		for (const record of records) input.graph.read(record.graphNodeId);
	}

	return {
		enableStorage() {
			if (activated) return;
			activated = true;
			enabled = true;
			for (const record of records) {
				const fallback = input.graph.read(record.graphNodeId);
				let value = fallback;
				try {
					value = globalThis.localStorage.getItem(record.key) ?? fallback;
				} catch {}
				input.graph.write({ graphNodeId: record.graphNodeId, value });
				setStorageAttribute(record.key, value);
			}
		},
		dispose() {
			for (const release of releases.splice(0)) release();
		},
	};
}

function storageMode(): unknown {
	const slot = (
		globalThis as typeof globalThis & Record<symbol, Record<string, unknown> | undefined>
	)[Symbol.for(STORAGE_SLOT_SYMBOL_KEY)];
	return slot?.[STORAGE_SLOT_MODE_KEY];
}

function setStorageAttribute(key: string, value: unknown): void {
	try {
		globalThis.document.documentElement.setAttribute(`data-${key}`, String(value));
	} catch {}
}
