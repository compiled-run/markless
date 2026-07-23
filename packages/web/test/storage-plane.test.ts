import { afterEach, expect, test, vi } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { STORAGE_SLOT_SYMBOL_KEY } from '@markless/serializer';
import { createRuntimeGraphFromStatePayload } from '../src/payload-graph-construct.ts';
import { createStoragePlane } from '../src/storage-plane.ts';

const storageSlotSymbol = Symbol.for(STORAGE_SLOT_SYMBOL_KEY);

afterEach(() => {
	delete (globalThis as typeof globalThis & Record<symbol, unknown>)[storageSlotSymbol];
	vi.unstubAllGlobals();
});

function storageState(
	records = [
		{
			graphNodeId: 'storage:src/App.tsrx#theme-mode',
			key: 'theme-mode',
		},
	],
) {
	return {
		version: 2 as const,
		cells: records.map((record) => ({ graphNodeId: record.graphNodeId, directValue: 'light' })),
		computed: [],
		storage: records,
	};
}

test('wake construction overrides storage fallbacks from the protocol slot', async () => {
	(globalThis as typeof globalThis & Record<symbol, unknown>)[storageSlotSymbol] = {
		'src/App.tsrx#theme-mode': 'dark',
	};
	const getItem = vi.fn();
	vi.stubGlobal('localStorage', { getItem });

	const graph = await createRuntimeGraphFromStatePayload(storageState() as never);

	expect(graph.read('storage:src/App.tsrx#theme-mode')).toBe('dark');
	expect(getItem).not.toHaveBeenCalled();
});

test('immediate warm mount reconciles a dependent from fallback to the seeded value', async () => {
	// Reproduces the warm/write-remount browser failure at the graph level: the
	// SSR text binding (a dependent subscriber) is created reading the fallback,
	// and the slot-seeded value must reconcile it to 'dark' when the storage
	// plane mounts — without an extra driver read.
	(globalThis as typeof globalThis & Record<symbol, unknown>)[storageSlotSymbol] = {
		'src/App.tsrx#theme-mode': 'dark',
	};
	const getItem = vi.fn();
	const setItem = vi.fn();
	const setAttribute = vi.fn();
	vi.stubGlobal('localStorage', { getItem, setItem });
	vi.stubGlobal('document', { documentElement: { setAttribute } });

	const state = storageState();
	const graph = await createRuntimeGraphFromStatePayload(state as never);

	// A dependent that mirrors the SSR-rendered text binding: it captured the
	// fallback at render time and updates only when the cell notifies.
	const rendered: string[] = [];
	graph.subscribe({
		id: 'text:theme',
		graphNodeId: 'storage:src/App.tsrx#theme-mode',
		run(value) {
			rendered.push(String(value));
		},
	});

	createStoragePlane({ graph, state: state as never });
	await graph.flush();

	expect(rendered).toEqual(['dark']); // reconciled from fallback, exactly once
	expect(graph.read('storage:src/App.tsrx#theme-mode')).toBe('dark');
	expect(getItem).not.toHaveBeenCalled(); // adopted from slot, no extra driver read
});

test('an absent slot lazily reads storage once on the first graph read', async () => {
	const getItem = vi.fn(() => 'dark');
	vi.stubGlobal('localStorage', { getItem });
	const graph = await createRuntimeGraphFromStatePayload(storageState() as never);

	expect(getItem).not.toHaveBeenCalled();
	expect(graph.read('storage:src/App.tsrx#theme-mode')).toBe('dark');
	expect(graph.read('storage:src/App.tsrx#theme-mode')).toBe('dark');
	expect(getItem).toHaveBeenCalledOnce();
});

test('one throwing driver write does not block attributes or later storage subscriptions', async () => {
	const records = [
		{ graphNodeId: 'storage:src/App.tsrx#theme-mode', key: 'theme-mode' },
		{ graphNodeId: 'storage:src/App.tsrx#contrast', key: 'contrast' },
	];
	const graph = createRuntimeGraph({
		cells: records.map((record) => ({ graphNodeId: record.graphNodeId, value: 'fallback' })),
	});
	const setItem = vi.fn((key: string) => {
		if (key === 'theme-mode') throw new Error('quota exceeded');
	});
	const setAttribute = vi.fn();
	vi.stubGlobal('localStorage', { setItem });
	vi.stubGlobal('document', { documentElement: { setAttribute } });
	const plane = createStoragePlane({ graph, state: storageState(records) as never });

	graph.write({ graphNodeId: records[0]!.graphNodeId, value: 'dark' });
	graph.write({ graphNodeId: records[1]!.graphNodeId, value: 'high' });
	await graph.flush();

	expect(setItem).toHaveBeenCalledWith('theme-mode', 'dark');
	expect(setItem).toHaveBeenCalledWith('contrast', 'high');
	expect(setAttribute).toHaveBeenCalledWith('data-theme-mode', 'dark');
	expect(setAttribute).toHaveBeenCalledWith('data-contrast', 'high');
	plane.dispose();
});
