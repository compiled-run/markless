import { storageAttributeName } from '../../serializer/src/storage-slot.ts';
import type { ProtocolStatePayload } from '@markless/serializer/protocol';
import type { RuntimeGraph } from '@markless/runtime';

export type StoragePlane = {
	readonly dispose: () => void;
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
// cells the plane is still awaited before the start wiring runs, because the
// read-initializer pass below must reconcile SSR bindings from their fallback to
// the slot-seeded value before anything else reads them.

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
		globalThis.document.documentElement.setAttribute(storageAttributeName(key), String(value));
	} catch {}
}
