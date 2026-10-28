import { expect, test } from 'vitest';
import { createRuntimeGraph } from '../src/index.ts';

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

test('a subscription commit lands beside its pass journal before the work after it settles', async () => {
	const landed: string[] = [];
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:picked', value: 'none' },
			{ graphNodeId: 'state:opened', value: 1 },
		],
	});
	graph.subscribe({
		id: 'dom-update:picked',
		graphNodeId: 'state:picked',
		run: (value) => ({ type: 'setText', locator: 'text:picked', value }),
	});
	graph.subscribe({
		id: 'repeat:opened',
		graphNodeId: 'state:opened',
		run: async () => {
			await macrotask();
			return async () => {
				landed.push('rows');
				await macrotask();
				landed.push('registered');
			};
		},
	});
	graph.subscribeJournal((entries) => {
		landed.push(...entries.map((entry) => `text:${(entry as { value: unknown }).value}`));
	});

	graph.write({ graphNodeId: 'state:picked', value: 'ben' });
	graph.write({ graphNodeId: 'state:opened', value: 2 });
	await graph.flush();

	expect(landed).toEqual(['rows', 'text:ben', 'registered']);
});

test('a write a commit makes is flushed by the same flush', async () => {
	const texts: unknown[] = [];
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:rows', value: 0 },
			{ graphNodeId: 'state:seeded', value: 'served' },
		],
	});
	graph.subscribe({
		id: 'repeat:rows',
		graphNodeId: 'state:rows',
		run: () => () => graph.write({ graphNodeId: 'state:seeded', value: 'minted' }),
	});
	graph.subscribe({
		id: 'dom-update:seeded',
		graphNodeId: 'state:seeded',
		run: (value) => ({ type: 'setText', locator: 'text:seeded', value }),
	});
	graph.subscribeJournal((entries) => {
		texts.push(...entries.map((entry) => (entry as { value: unknown }).value));
	});

	graph.write({ graphNodeId: 'state:rows', value: 1 });
	await graph.flush();

	expect(texts).toEqual(['minted']);
});

test('a write observer leaves its DOM to the pass while a subscription in that pass still loads code', async () => {
	const landed: string[] = [];
	let loaded = false;
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:requests', value: 0 },
			{ graphNodeId: 'state:rows', value: 'served' },
		],
	});
	graph.subscribe({
		id: 'dom-update:requests',
		graphNodeId: 'state:requests',
		ready: () => loaded,
		run: async (value) => {
			await macrotask();
			loaded = true;
			return { type: 'setText', locator: 'text:requests', value };
		},
	});
	graph.subscribe({
		id: 'repeat:rows',
		graphNodeId: 'state:rows',
		run: () => () => void landed.push('rows by the pass'),
	});
	graph.subscribeWrite({
		graphNodeId: 'state:rows',
		run: () => void landed.push('rows at the write'),
	});
	graph.subscribeJournal((entries) => {
		landed.push(...entries.map((entry) => `text:${(entry as { value: unknown }).value}`));
	});

	graph.write({ graphNodeId: 'state:requests', value: 1 });
	graph.write({ graphNodeId: 'state:rows', value: 'editing' });
	expect(landed).toEqual([]);
	await graph.flush();
	expect(landed).toEqual(['rows by the pass', 'text:1']);

	graph.write({ graphNodeId: 'state:requests', value: 2 });
	graph.write({ graphNodeId: 'state:rows', value: 'saved' });
	expect(landed.at(-1)).toBe('rows at the write');
});
