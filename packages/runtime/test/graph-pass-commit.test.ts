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
		code: () => (loaded ? 'loaded' : macrotask()),
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

test('a commit waits for code the next round loads, so that round lands in the task the commit paints in', async () => {
	const landed: string[] = [];
	let loaded = false;
	let loading: Promise<void> | undefined;
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:answer', value: 1 },
			{ graphNodeId: 'state:label', value: 'Page 1' },
		],
	});
	graph.subscribe({
		id: 'repeat:answer',
		graphNodeId: 'state:answer',
		run: (value) => {
			graph.write({ graphNodeId: 'state:label', value: `Page ${value}` });
			return () => void landed.push('rows');
		},
	});
	graph.subscribe({
		id: 'dom-update:label',
		graphNodeId: 'state:label',
		code: () =>
			loaded
				? 'loaded'
				: (loading ??= (async () => {
						await macrotask();
						loaded = true;
						landed.push('loaded');
					})()),
		run: async (value) => {
			if (!loaded) await macrotask();
			return { type: 'setText', locator: 'text:label', value };
		},
	});
	graph.subscribeJournal((entries) => {
		landed.push(...entries.map((entry) => `text:${(entry as { value: unknown }).value}`));
	});
	let tasks = 0;
	const counting = setInterval(() => tasks++, 0);

	graph.write({ graphNodeId: 'state:answer', value: 2 });
	await graph.flush();
	clearInterval(counting);

	expect(landed).toEqual(['loaded', 'rows', 'text:Page 2']);
	expect(tasks).toBeLessThanOrEqual(1);
});

test('an async answer leaves rows to the pass instead of a write observer', async () => {
	const { createAsyncComputedPlane } = await import('../src/graph-async.ts');
	const landed: string[] = [];
	let answer!: (value: unknown) => void;
	const graph = createRuntimeGraph({
		async: createAsyncComputedPlane,
		cells: [{ graphNodeId: 'state:page', value: 1 }],
		asyncComputed: [
			{
				graphNodeId: 'computed:current',
				dependencies: [{ graphNodeId: 'state:page', path: [] }],
				key: (read: (id: string) => unknown) => read('state:page'),
				run: () => new Promise((resolve) => (answer = resolve)),
			},
		],
	} as never);
	graph.subscribe({
		id: 'repeat:rows',
		graphNodeId: 'computed:current',
		path: ['value'],
		run: () => () => void landed.push('rows by the pass'),
	});
	graph.subscribeWrite?.({
		graphNodeId: 'computed:current',
		run: () => void landed.push('rows at the answer'),
	});
	graph.read('computed:current', ['value']);
	await graph.flush();
	landed.length = 0;

	answer({ rows: ['p1'] });
	await macrotask();
	await graph.flush();

	expect(landed).toEqual(['rows by the pass']);
});
