import { expect, test } from 'vitest';
import { createRuntimeGraph } from '../src/index.ts';

test('runtime graph invalidates path subscribers and flushes concrete journal entries', async () => {
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:count', value: 0 },
			{ graphNodeId: 'state:menu', value: { open: true, title: 'Menu' } },
		],
	});

	expect(graph.read('state:count')).toBe(0);
	expect(graph.read('state:menu', ['title'])).toBe('Menu');

	graph.subscribe({
		id: 'dom-update:title',
		graphNodeId: 'state:menu',
		path: ['title'],
		run(value) {
			return { type: 'setText', locator: 'text:title', value };
		},
	});

	graph.write({
		graphNodeId: 'state:menu',
		path: ['open'],
		value: false,
	});
	await graph.flush();
	expect(graph.takeJournal()).toEqual([]);

	graph.write({
		graphNodeId: 'state:menu',
		path: ['title'],
		value: 'File',
	});
	await graph.flush();
	expect(graph.read('state:menu', ['title'])).toBe('File');
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:title', value: 'File' },
	]);

	graph.update({
		graphNodeId: 'state:count',
		path: [],
		update: (value) => Number(value) + 1,
	});
	await graph.flush();
	expect(graph.read('state:count')).toBe(1);
	expect(graph.takeJournal()).toEqual([]);
});

test('runtime graph emits shared patches for graph writes to shared graph nodes', async () => {
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				value: {
					status: 'anonymous',
				},
			},
		],
		sharedDefinitions: [
			{
				id: 'shared:src/session.tsrx#session',
				name: 'session',
				exportedName: 'session',
				scope: 'page',
				version: 0,
				graphNodeIds: ['shared:src/session.tsrx#session/state:data'],
				returnProperties: [
					{
						kind: 'graph',
						name: 'status',
						graphNodeId: 'shared:src/session.tsrx#session/state:data',
						path: ['status'],
					},
				],
			},
		],
	});

	graph.write({
		graphNodeId: 'shared:src/session.tsrx#session/state:data',
		path: ['status'],
		value: 'ready',
	});
	await graph.flush();

	expect(graph.readShared('shared:src/session.tsrx#session', 'status')).toBe('ready');
	expect(graph.takeSharedPatches()).toEqual([
		{
			id: 'shared:src/session.tsrx#session',
			scope: 'page',
			version: 1,
			patch: [['set', ['status'], 'ready']],
		},
	]);
});

test('runtime graph appends multiple DOM journal entries from one subscription in order', async () => {
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:count', value: 0 }],
	});

	graph.subscribe({
		id: 'dom-update:count',
		graphNodeId: 'state:count',
		path: [],
		run(value) {
			return [
				{ type: 'setText', locator: 'text:count', value },
				{
					type: 'setAttr',
					locator: 'button:count',
					name: 'data-count',
					value: String(value),
				},
				{
					type: 'setProp',
					locator: 'button:count',
					name: 'disabled',
					value: Number(value) > 0,
				},
			];
		},
	});

	graph.write({ graphNodeId: 'state:count', value: 1 });
	await graph.flush();

	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:count', value: 1 },
		{
			type: 'setAttr',
			locator: 'button:count',
			name: 'data-count',
			value: '1',
		},
		{
			type: 'setProp',
			locator: 'button:count',
			name: 'disabled',
			value: true,
		},
	]);
});

test('runtime graph applies collection method calls with path invalidation', async () => {
	const cache = new Map<string, string>();
	const selected = new Set<string>();
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					items: ['first'],
					cache,
					selected,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:items',
		graphNodeId: 'state:collections',
		path: ['items'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:items',
				value: (value as string[]).join(','),
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:cache',
		graphNodeId: 'state:collections',
		path: ['cache'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:cache',
				value: (value as Map<string, string>).get('next'),
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:selected',
		graphNodeId: 'state:collections',
		path: ['selected'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:selected',
				value: (value as Set<string>).has('item'),
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['items'],
			method: 'push',
			args: ['second'],
		}),
	).toBe(2);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['cache'],
			method: 'set',
			args: ['next', 'value'],
		}),
	).toBe(cache);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['selected'],
			method: 'add',
			args: ['item'],
		}),
	).toBe(selected);

	await graph.flush();

	expect(graph.read('state:collections', ['items'])).toEqual(['first', 'second']);
	expect(graph.read('state:collections', ['cache'])).toBe(cache);
	expect(cache.get('next')).toBe('value');
	expect(graph.read('state:collections', ['selected'])).toBe(selected);
	expect(selected.has('item')).toBe(true);
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:items', value: 'first,second' },
		{ type: 'setText', locator: 'text:cache', value: 'value' },
		{ type: 'setText', locator: 'text:selected', value: true },
	]);
});

test('runtime graph preserves collection delete return values and skips no-op invalidation', async () => {
	const cache = new Map<string, string>([['next', 'value']]);
	const selected = new Set<string>(['item']);
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					cache,
					selected,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:cache',
		graphNodeId: 'state:collections',
		path: ['cache'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:cache',
				value: (value as Map<string, string>).has('next'),
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:selected',
		graphNodeId: 'state:collections',
		path: ['selected'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:selected',
				value: (value as Set<string>).has('item'),
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['cache'],
			method: 'delete',
			args: ['next'],
		}),
	).toBe(true);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['selected'],
			method: 'delete',
			args: ['missing'],
		}),
	).toBe(false);

	await graph.flush();

	expect(cache.has('next')).toBe(false);
	expect(selected.has('item')).toBe(true);
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:cache', value: false }]);
});

test('runtime graph skips collection clear invalidation when the collection is already empty', async () => {
	const emptyCache = new Map<string, string>();
	const selected = new Set<string>(['item']);
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					emptyCache,
					selected,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:empty-cache',
		graphNodeId: 'state:collections',
		path: ['emptyCache'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:empty-cache',
				value: (value as Map<string, string>).size,
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:selected',
		graphNodeId: 'state:collections',
		path: ['selected'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:selected',
				value: (value as Set<string>).size,
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['emptyCache'],
			method: 'clear',
		}),
	).toBeUndefined();
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['selected'],
			method: 'clear',
		}),
	).toBeUndefined();

	await graph.flush();

	expect(emptyCache.size).toBe(0);
	expect(selected.size).toBe(0);
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:selected', value: 0 }]);
});

test('runtime graph skips Set.add invalidation when the value already exists', async () => {
	const selected = new Set<string>(['item']);
	const pending = new Set<string>();
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					selected,
					pending,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:selected',
		graphNodeId: 'state:collections',
		path: ['selected'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:selected',
				value: (value as Set<string>).size,
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:pending',
		graphNodeId: 'state:collections',
		path: ['pending'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:pending',
				value: (value as Set<string>).size,
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['selected'],
			method: 'add',
			args: ['item'],
		}),
	).toBe(selected);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['pending'],
			method: 'add',
			args: ['item'],
		}),
	).toBe(pending);

	await graph.flush();

	expect(selected.size).toBe(1);
	expect(pending.size).toBe(1);
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:pending', value: 1 }]);
});

test('runtime graph skips Map.set invalidation when the key already has the same value', async () => {
	const cache = new Map<string, string>([['next', 'value']]);
	const pending = new Map<string, string>();
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					cache,
					pending,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:cache',
		graphNodeId: 'state:collections',
		path: ['cache'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:cache',
				value: (value as Map<string, string>).get('next'),
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:pending',
		graphNodeId: 'state:collections',
		path: ['pending'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:pending',
				value: (value as Map<string, string>).get('next'),
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['cache'],
			method: 'set',
			args: ['next', 'value'],
		}),
	).toBe(cache);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['pending'],
			method: 'set',
			args: ['next', 'value'],
		}),
	).toBe(pending);

	await graph.flush();

	expect(cache.get('next')).toBe('value');
	expect(pending.get('next')).toBe('value');
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:pending', value: 'value' },
	]);
});

test('runtime graph skips Array.pop invalidation when the array is already empty', async () => {
	const emptyItems: string[] = [];
	const pending = ['item'];
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					emptyItems,
					pending,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:empty-items',
		graphNodeId: 'state:collections',
		path: ['emptyItems'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:empty-items',
				value: (value as string[]).length,
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:pending',
		graphNodeId: 'state:collections',
		path: ['pending'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:pending',
				value: (value as string[]).length,
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['emptyItems'],
			method: 'pop',
		}),
	).toBeUndefined();
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['pending'],
			method: 'pop',
		}),
	).toBe('item');

	await graph.flush();

	expect(emptyItems).toEqual([]);
	expect(pending).toEqual([]);
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:pending', value: 0 }]);
});

test('runtime graph skips Array.shift invalidation when the array is already empty', async () => {
	const emptyItems: string[] = [];
	const pending = ['item'];
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					emptyItems,
					pending,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:empty-items',
		graphNodeId: 'state:collections',
		path: ['emptyItems'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:empty-items',
				value: (value as string[]).length,
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:pending',
		graphNodeId: 'state:collections',
		path: ['pending'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:pending',
				value: (value as string[]).length,
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['emptyItems'],
			method: 'shift',
		}),
	).toBeUndefined();
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['pending'],
			method: 'shift',
		}),
	).toBe('item');

	await graph.flush();

	expect(emptyItems).toEqual([]);
	expect(pending).toEqual([]);
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:pending', value: 0 }]);
});

test('runtime graph skips Array.push and Array.unshift invalidation when no values are added', async () => {
	const appendItems = ['existing'];
	const prependItems = ['existing'];
	const pending: string[] = [];
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					appendItems,
					prependItems,
					pending,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:append-items',
		graphNodeId: 'state:collections',
		path: ['appendItems'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:append-items',
				value: (value as string[]).join(','),
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:prepend-items',
		graphNodeId: 'state:collections',
		path: ['prependItems'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:prepend-items',
				value: (value as string[]).join(','),
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:pending',
		graphNodeId: 'state:collections',
		path: ['pending'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:pending',
				value: (value as string[]).join(','),
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['appendItems'],
			method: 'push',
		}),
	).toBe(1);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['prependItems'],
			method: 'unshift',
		}),
	).toBe(1);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['pending'],
			method: 'push',
			args: ['item'],
		}),
	).toBe(1);

	await graph.flush();

	expect(appendItems).toEqual(['existing']);
	expect(prependItems).toEqual(['existing']);
	expect(pending).toEqual(['item']);
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:pending', value: 'item' },
	]);
});

test('runtime graph invalidates array index subscribers when length is written', async () => {
	const items = ['first', 'second'];
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:items',
				value: items,
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:length',
		graphNodeId: 'state:items',
		path: ['length'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:length',
				value,
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:second',
		graphNodeId: 'state:items',
		path: ['1'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:second',
				value,
			};
		},
	});

	graph.write({
		graphNodeId: 'state:items',
		path: ['length'],
		value: 1,
	});

	await graph.flush();

	expect(items).toEqual(['first']);
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:length', value: 1 },
		{ type: 'setText', locator: 'text:second', value: undefined },
	]);
});

test('runtime graph skips Array.splice invalidation when the call does not mutate', async () => {
	const stableItems = ['first', 'second'];
	const pendingItems = ['first', 'second'];
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					stableItems,
					pendingItems,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:stable-items',
		graphNodeId: 'state:collections',
		path: ['stableItems'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:stable-items',
				value: (value as string[]).join(','),
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:pending-items',
		graphNodeId: 'state:collections',
		path: ['pendingItems'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:pending-items',
				value: (value as string[]).join(','),
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['stableItems'],
			method: 'splice',
		}),
	).toEqual([]);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['pendingItems'],
			method: 'splice',
			args: [1, 1, 'third'],
		}),
	).toEqual(['second']);

	await graph.flush();

	expect(stableItems).toEqual(['first', 'second']);
	expect(pendingItems).toEqual(['first', 'third']);
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:pending-items', value: 'first,third' },
	]);
});

test('runtime graph skips array mutator invalidation when the array contents do not change', async () => {
	const stableCopy = ['a', 'b'];
	const copied = ['a', 'b', 'c'];
	const stableFill = ['x'];
	const filled = ['x', 'y'];
	const stableReverse = ['only'];
	const reversed = ['a', 'b'];
	const stableSort = ['a', 'b'];
	const sorted = ['b', 'a'];
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					stableCopy,
					copied,
					stableFill,
					filled,
					stableReverse,
					reversed,
					stableSort,
					sorted,
				},
			},
		],
	});

	for (const key of [
		'stableCopy',
		'copied',
		'stableFill',
		'filled',
		'stableReverse',
		'reversed',
		'stableSort',
		'sorted',
	]) {
		graph.subscribe({
			id: `dom-update:${key}`,
			graphNodeId: 'state:collections',
			path: [key],
			run(value) {
				return {
					type: 'setText',
					locator: `text:${key}`,
					value: (value as string[]).join(','),
				};
			},
		});
	}

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['stableCopy'],
			method: 'copyWithin',
			args: [0, 0],
		}),
	).toBe(stableCopy);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['copied'],
			method: 'copyWithin',
			args: [0, 1],
		}),
	).toBe(copied);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['stableFill'],
			method: 'fill',
			args: ['x'],
		}),
	).toBe(stableFill);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['filled'],
			method: 'fill',
			args: ['z', 1],
		}),
	).toBe(filled);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['stableReverse'],
			method: 'reverse',
		}),
	).toBe(stableReverse);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['reversed'],
			method: 'reverse',
		}),
	).toBe(reversed);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['stableSort'],
			method: 'sort',
		}),
	).toBe(stableSort);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['sorted'],
			method: 'sort',
		}),
	).toBe(sorted);

	await graph.flush();

	expect(stableCopy).toEqual(['a', 'b']);
	expect(copied).toEqual(['b', 'c', 'c']);
	expect(stableFill).toEqual(['x']);
	expect(filled).toEqual(['x', 'z']);
	expect(stableReverse).toEqual(['only']);
	expect(reversed).toEqual(['b', 'a']);
	expect(stableSort).toEqual(['a', 'b']);
	expect(sorted).toEqual(['a', 'b']);
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:copied', value: 'b,c,c' },
		{ type: 'setText', locator: 'text:filled', value: 'x,z' },
		{ type: 'setText', locator: 'text:reversed', value: 'b,a' },
		{ type: 'setText', locator: 'text:sorted', value: 'a,b' },
	]);
});

test('runtime graph invalidates sparse array mutators when holes become own values', async () => {
	const sparseItems: Array<string | undefined> = [];
	sparseItems.length = 2;
	sparseItems[1] = 'last';
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					sparseItems,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:sparse-items',
		graphNodeId: 'state:collections',
		path: ['sparseItems'],
		run(value) {
			const items = value as Array<string | undefined>;
			return {
				type: 'setText',
				locator: 'text:sparse-items',
				value: Object.prototype.hasOwnProperty.call(items, '0') ? 'own' : 'hole',
			};
		},
	});

	expect(Object.prototype.hasOwnProperty.call(sparseItems, '0')).toBe(false);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['sparseItems'],
			method: 'fill',
			args: [undefined, 0, 1],
		}),
	).toBe(sparseItems);

	await graph.flush();

	expect(sparseItems.length).toBe(2);
	expect(sparseItems[0]).toBeUndefined();
	expect(Object.prototype.hasOwnProperty.call(sparseItems, '0')).toBe(true);
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:sparse-items', value: 'own' },
	]);
});

test('runtime graph rejects unsupported collection method calls without invalidation', async () => {
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:items',
				value: ['first'],
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:items',
		graphNodeId: 'state:items',
		path: [],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:items',
				value: (value as string[]).join(','),
			};
		},
	});

	expect(() =>
		graph.call({
			graphNodeId: 'state:items',
			path: [],
			method: 'map',
			args: [(value: unknown) => value],
		}),
	).toThrow('Unsupported graph collection method "map".');

	await graph.flush();

	expect(graph.read('state:items')).toEqual(['first']);
	expect(graph.takeJournal()).toEqual([]);
});

test('runtime graph applies Date setter calls with timestamp invalidation', async () => {
	const stableDate = new Date('2026-06-16T12:00:00.000Z');
	const pendingDate = new Date('2026-06-16T12:00:00.000Z');
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:dates',
				value: {
					stableDate,
					pendingDate,
				},
			},
		],
	});

	for (const key of ['stableDate', 'pendingDate']) {
		graph.subscribe({
			id: `dom-update:${key}`,
			graphNodeId: 'state:dates',
			path: [key],
			run(value) {
				return {
					type: 'setText',
					locator: `text:${key}`,
					value: (value as Date).toISOString(),
				};
			},
		});
	}

	expect(
		graph.call({
			graphNodeId: 'state:dates',
			path: ['stableDate'],
			method: 'setTime',
			args: [stableDate.getTime()],
		}),
	).toBe(stableDate.getTime());
	expect(
		graph.call({
			graphNodeId: 'state:dates',
			path: ['pendingDate'],
			method: 'setUTCFullYear',
			args: [2027],
		}),
	).toBe(Date.UTC(2027, 5, 16, 12, 0, 0, 0));

	await graph.flush();

	expect(stableDate.toISOString()).toBe('2026-06-16T12:00:00.000Z');
	expect(pendingDate.toISOString()).toBe('2027-06-16T12:00:00.000Z');
	expect(graph.takeJournal()).toEqual([
		{
			type: 'setText',
			locator: 'text:pendingDate',
			value: '2027-06-16T12:00:00.000Z',
		},
	]);
});

test('runtime graph deletes object paths with path invalidation', async () => {
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:menu',
				value: { open: true, title: 'Menu' },
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:open',
		graphNodeId: 'state:menu',
		path: ['open'],
		run(value) {
			return { type: 'setText', locator: 'text:open', value };
		},
	});
	graph.subscribe({
		id: 'dom-update:title',
		graphNodeId: 'state:menu',
		path: ['title'],
		run(value) {
			return { type: 'setText', locator: 'text:title', value };
		},
	});

	expect(graph.delete({ graphNodeId: 'state:menu', path: ['open'] })).toBe(true);
	await graph.flush();

	expect(graph.read('state:menu', ['open'])).toBeUndefined();
	expect(graph.read('state:menu', ['title'])).toBe('Menu');
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:open', value: undefined },
	]);
});

test('runtime graph skips object delete invalidation when no property is removed', async () => {
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:menu',
				value: { open: true },
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:missing',
		graphNodeId: 'state:menu',
		path: ['missing'],
		run(value) {
			return { type: 'setText', locator: 'text:missing', value };
		},
	});

	expect(graph.delete({ graphNodeId: 'state:menu', path: ['missing'] })).toBe(true);
	await graph.flush();

	expect(graph.read('state:menu', ['missing'])).toBeUndefined();
	expect(graph.takeJournal()).toEqual([]);
});

test('runtime graph update can return previous or next graph values', async () => {
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:count', value: 1 }],
	});

	graph.subscribe({
		id: 'dom-update:count',
		graphNodeId: 'state:count',
		path: [],
		run(value) {
			return { type: 'setText', locator: 'text:count', value };
		},
	});

	expect(
		graph.update({
			graphNodeId: 'state:count',
			update: (value) => Number(value) + 1,
			returnValue: 'previous',
		}),
	).toBe(1);
	expect(graph.read('state:count')).toBe(2);

	expect(
		graph.update({
			graphNodeId: 'state:count',
			update: (value) => Number(value) + 1,
			returnValue: 'next',
		}),
	).toBe(3);
	expect(graph.read('state:count')).toBe(3);

	await graph.flush();

	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:count', value: 3 }]);
});

test('runtime graph schedules a microtask flush for writes in an idle turn', async () => {
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:count', value: 0 }],
	});

	graph.subscribe({
		id: 'dom-update:count',
		graphNodeId: 'state:count',
		path: [],
		run(value) {
			return { type: 'setText', locator: 'button:text', value };
		},
	});

	graph.write({ graphNodeId: 'state:count', value: 1 });
	graph.write({ graphNodeId: 'state:count', value: 2 });

	expect(graph.takeJournal()).toEqual([]);

	await drainMicrotasks();

	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'button:text', value: 2 }]);
});

test('runtime graph flush waits for an in-progress scheduled flush', async () => {
	const release = deferred<void>();
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:count', value: 0 }],
	});
	let subscriptionStarted = false;

	graph.subscribe({
		id: 'dom-update:count',
		graphNodeId: 'state:count',
		path: [],
		async run(value) {
			subscriptionStarted = true;
			await release.promise;
			return { type: 'setText', locator: 'button:text', value };
		},
	});

	graph.write({ graphNodeId: 'state:count', value: 1 });
	await Promise.resolve();

	expect(subscriptionStarted).toBe(true);

	let flushSettled = false;
	const flush = graph.flush().then(() => {
		flushSettled = true;
	});
	await Promise.resolve();

	expect(flushSettled).toBe(false);

	release.resolve();
	await flush;

	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'button:text', value: 1 }]);
});

test('runtime graph lazily recomputes sync computed nodes after path-granular invalidation', async () => {
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:menu', value: { open: true, title: 'Menu' } }],
		computed: [
			{
				graphNodeId: 'computed:menuTitle',
				dependencies: [{ graphNodeId: 'state:menu', path: ['title'] }],
				compute: (read) => `${String(read('state:menu', ['title']))}!`,
			},
		],
	});

	expect(graph.read('computed:menuTitle')).toBe('Menu!');

	graph.subscribe({
		id: 'dom-update:menuTitle',
		graphNodeId: 'computed:menuTitle',
		path: [],
		run(value) {
			return { type: 'setText', locator: 'text:menu-title', value };
		},
	});

	graph.write({ graphNodeId: 'state:menu', path: ['open'], value: false });
	await graph.flush();
	expect(graph.read('computed:menuTitle')).toBe('Menu!');
	expect(graph.takeJournal()).toEqual([]);

	graph.write({ graphNodeId: 'state:menu', path: ['title'], value: 'File' });
	expect(graph.read('computed:menuTitle')).toBe('File!');
	await graph.flush();

	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:menu-title', value: 'File!' },
	]);
});

test('runtime graph invalidates computed dependency chains', async () => {
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:user', value: { first: 'Ada', last: 'Lovelace' } }],
		computed: [
			{
				graphNodeId: 'computed:displayName',
				dependencies: [{ graphNodeId: 'state:user', path: ['first'] }],
				compute: (read) => String(read('state:user', ['first'])).toUpperCase(),
			},
			{
				graphNodeId: 'computed:greeting',
				dependencies: [{ graphNodeId: 'computed:displayName', path: [] }],
				compute: (read) => `Hello ${String(read('computed:displayName'))}`,
			},
		],
	});

	expect(graph.read('computed:greeting')).toBe('Hello ADA');

	graph.subscribe({
		id: 'dom-update:greeting',
		graphNodeId: 'computed:greeting',
		path: [],
		run(value) {
			return { type: 'setText', locator: 'text:greeting', value };
		},
	});

	graph.write({ graphNodeId: 'state:user', path: ['first'], value: 'Grace' });
	await graph.flush();

	expect(graph.read('computed:greeting')).toBe('Hello GRACE');
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:greeting', value: 'Hello GRACE' },
	]);
});

test('runtime graph versions async computed requests and ignores stale completions', async () => {
	const first = deferred<string>();
	const second = deferred<string>();
	const runs: Array<{ readonly key: unknown; readonly signal: AbortSignal }> = [];

	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:userId', value: 'a' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run({ key, signal }) {
					runs.push({ key, signal });
					return key === 'a' ? first.promise : second.promise;
				},
			},
		],
	});

	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 1,
		key: 'a',
	});
	expect(runs).toHaveLength(1);

	graph.subscribe({
		id: 'dom-update:user',
		graphNodeId: 'computed:user',
		path: [],
		run(value) {
			const snapshot = value as { readonly status: string; readonly value?: unknown };
			return {
				type: 'setText',
				locator: 'text:user',
				value: snapshot.status === 'fulfilled' ? snapshot.value : snapshot.status,
			};
		},
	});

	graph.write({ graphNodeId: 'state:userId', value: 'b' });
	await graph.flush();

	expect(runs[0].signal.aborted).toBe(true);
	expect(runs).toHaveLength(2);
	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 2,
		key: 'b',
	});
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'pending' },
	]);

	first.resolve('Alice');
	await drainMicrotasks();
	await graph.flush();

	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 2,
		key: 'b',
	});
	expect(graph.takeJournal()).toEqual([]);

	second.resolve('Bob');
	await drainMicrotasks();
	await graph.flush();

	expect(graph.read('computed:user')).toEqual({
		status: 'fulfilled',
		version: 2,
		key: 'b',
		value: 'Bob',
	});
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:user', value: 'Bob' }]);
});

test('runtime graph ignores stale rejected async computed completions', async () => {
	const first = deferred<string>();
	const second = deferred<string>();
	const staleError = new Error('stale');
	const runs: Array<{ readonly key: unknown; readonly signal: AbortSignal }> = [];

	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:userId', value: 'a' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run({ key, signal }) {
					runs.push({ key, signal });
					return key === 'a' ? first.promise : second.promise;
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:user',
		graphNodeId: 'computed:user',
		path: [],
		run(value) {
			const snapshot = value as { readonly status: string; readonly value?: unknown };
			return {
				type: 'setText',
				locator: 'text:user',
				value: snapshot.status === 'fulfilled' ? snapshot.value : snapshot.status,
			};
		},
	});

	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 1,
		key: 'a',
	});
	await drainMicrotasks();
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'pending' },
	]);

	graph.write({ graphNodeId: 'state:userId', value: 'b' });
	await graph.flush();

	expect(runs[0].signal.aborted).toBe(true);
	expect(runs).toHaveLength(2);
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'pending' },
	]);

	first.reject(staleError);
	await drainMicrotasks();
	await graph.flush();

	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 2,
		key: 'b',
	});
	expect(graph.takeJournal()).toEqual([]);

	second.resolve('Bob');
	await drainMicrotasks();

	expect(graph.read('computed:user')).toEqual({
		status: 'fulfilled',
		version: 2,
		key: 'b',
		value: 'Bob',
	});
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:user', value: 'Bob' }]);
});

test('runtime graph skips async computed invalidation when the dependency key is unchanged', async () => {
	const request = deferred<string>();
	const runs: Array<{ readonly key: unknown; readonly signal: AbortSignal }> = [];
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:route', value: { id: 'a', tab: 'overview' } }],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [{ graphNodeId: 'state:route', path: [] }],
				key: (read) => read('state:route', ['id']),
				run({ key, signal }) {
					runs.push({ key, signal });
					return request.promise;
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:user',
		graphNodeId: 'computed:user',
		path: [],
		run(value) {
			const snapshot = value as { readonly status: string };
			return { type: 'setText', locator: 'text:user', value: snapshot.status };
		},
	});

	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 1,
		key: 'a',
	});
	await drainMicrotasks();
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'pending' },
	]);

	graph.write({ graphNodeId: 'state:route', path: ['tab'], value: 'details' });
	await graph.flush();

	expect(runs).toHaveLength(1);
	expect(runs[0].signal.aborted).toBe(false);
	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 1,
		key: 'a',
	});
	expect(graph.takeJournal()).toEqual([]);
});

test('runtime graph schedules pending flush after standalone async computed demand', async () => {
	const request = deferred<string>();
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:userId', value: 'a' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run() {
					return request.promise;
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:user',
		graphNodeId: 'computed:user',
		path: [],
		run(value) {
			const snapshot = value as { readonly status: string; readonly value?: unknown };
			return {
				type: 'setText',
				locator: 'text:user',
				value: snapshot.status === 'fulfilled' ? snapshot.value : snapshot.status,
			};
		},
	});

	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 1,
		key: 'a',
	});

	await drainMicrotasks();

	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'pending' },
	]);

	request.resolve('Alice');
	await drainMicrotasks();

	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'Alice' },
	]);
});

test('runtime graph commits rejected async computed snapshots by request version', async () => {
	const request = deferred<string>();
	const failure = new Error('No user');
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:userId', value: 'missing' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run() {
					return request.promise;
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:user',
		graphNodeId: 'computed:user',
		path: [],
		run(value) {
			const snapshot = value as { readonly status: string };
			return { type: 'setText', locator: 'text:user', value: snapshot.status };
		},
	});

	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 1,
		key: 'missing',
	});

	await drainMicrotasks();

	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'pending' },
	]);

	request.reject(failure);
	await drainMicrotasks();

	expect(graph.read('computed:user')).toEqual({
		status: 'rejected',
		version: 1,
		key: 'missing',
		error: failure,
	});
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'rejected' },
	]);
});

function deferred<T>(): {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
	readonly reject: (error: unknown) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return { promise, resolve, reject };
}

async function drainMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}
