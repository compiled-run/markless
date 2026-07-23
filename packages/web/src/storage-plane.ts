import type { ProtocolStatePayload } from '@markless/serializer/protocol';
import type { RuntimeGraph } from '@markless/runtime';

export type StoragePlane = {
	readonly dispose: () => void;
};

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
				setStorageAttribute(record.key, value);
			},
		}),
	);

	// Trigger each storage cell's read initializer now, so the slot-seeded value
	// is adopted into the graph and its dependents (the SSR text bindings)
	// reconcile from the fallback to the seeded value. Without this the
	// initializer only fires if some later read happens to touch the cell, and an
	// SSR-rendered binding never re-reads on its own — the warm/write-remount bug.
	// Reads go through the slot-backed initializer, so no extra driver read occurs.
	for (const record of records) input.graph.read(record.graphNodeId);

	return {
		dispose() {
			for (const release of releases.splice(0)) release();
		},
	};
}

function setStorageAttribute(key: string, value: unknown): void {
	try {
		globalThis.document.documentElement.setAttribute(`data-${key}`, String(value));
	} catch {}
}
