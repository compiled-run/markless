import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { createResumeRuntime } from '../src/index.ts';
import type { ResumeDomElement, ResumeViewRecord } from '../src/resume-types.ts';

/**
 * A gesture the browser aimed at a row that a PREVIOUS gesture's own write has
 * since removed.
 *
 * Dispatch runs several microtasks behind the press it answers - the entry
 * capture queues, the runtime module is imported, the graph flush that rebuilds
 * the rows lands in between - so by the time the walk looks at the target, the
 * keyed repeat has detached it. The event was live when it fired, so it is
 * routed on the path it WOULD have taken: the parent the row was removed from
 * stands in for the link the DOM no longer holds, and every record above the
 * repeat still runs. The one record that does not is the removed row's own,
 * once its key has left the collection: that row has no item left to act on.
 */

type Node = {
	nodeType: number;
	tagName?: string;
	childNodes: Node[];
	parentElement?: Node | null;
	id?: string;
	insertBefore?: (node: Node, before: Node | null) => unknown;
	appendChild?: (node: Node) => unknown;
	removeChild?: (node: Node) => unknown;
	listeners: Array<{ readonly type: string; readonly listener: (event: DomEvent) => unknown }>;
	addEventListener(type: string, listener: (event: DomEvent) => unknown): void;
	removeEventListener(type: string, listener: (event: DomEvent) => unknown): void;
};

type DomEvent = { readonly type: string; readonly target: Node };

function el(tagName: string, children: Node[] = []): Node {
	const node: Node = {
		nodeType: 1,
		tagName,
		childNodes: children,
		listeners: [],
		addEventListener(type, listener) {
			node.listeners.push({ type, listener });
		},
		removeEventListener(type, listener) {
			const at = node.listeners.findIndex(
				(entry) => entry.type === type && entry.listener === listener,
			);
			if (at >= 0) node.listeners.splice(at, 1);
		},
	};
	node.insertBefore = (fresh, before) => {
		const held = node.childNodes.indexOf(fresh);
		if (held >= 0) node.childNodes.splice(held, 1);
		const at = before ? node.childNodes.indexOf(before) : -1;
		if (at >= 0) node.childNodes.splice(at, 0, fresh);
		else node.childNodes.push(fresh);
		fresh.parentElement = node;
		return fresh;
	};
	node.appendChild = (fresh) => node.insertBefore!(fresh, null);
	node.removeChild = (gone) => {
		const at = node.childNodes.indexOf(gone);
		if (at >= 0) node.childNodes.splice(at, 1);
		gone.parentElement = null;
		return gone;
	};
	for (const child of children) child.parentElement = node;
	return node;
}

function click(target: Node): DomEvent {
	return { type: 'click', target };
}

type Item = { readonly id: string };

function fixture() {
	const rows = [el('LI', [el('BUTTON')]), el('LI', [el('BUTTON')])];
	const list = el('UL', rows);
	const root = el('SECTION', [list]);
	const view = {
		locators: [],
		events: [{ hostNodeId: 'page', eventName: 'click', symbolIds: ['symbol:page'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
		keyedRepeats: [
			{
				id: 'repeat:rows',
				parentHostNodeId: 'list',
				collectionGraphNodeId: 'state:rows',
				collectionPath: [],
				keyPath: ['id'],
				itemName: 'row',
				rowElementCount: 1,
				rowEvents: [{ hostPath: [0], eventName: 'click', symbolIds: ['symbol:row'] }],
			},
		],
	} as unknown as ResumeViewRecord;
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:rows', value: [{ id: 'a' }, { id: 'b' }] as Item[] }],
	});
	const ran: string[] = [];
	const rowItems: unknown[] = [];
	const runtime = createResumeRuntime({
		root: root as unknown as ResumeDomElement,
		graph,
		view,
		liveHostNodes: new Map<string, ResumeDomElement>([
			['page', root as unknown as ResumeDomElement],
			['list', list as unknown as ResumeDomElement],
		]),
		loadSymbol: (symbolId: string) => (context: { readonly locals?: Record<string, unknown> }) => {
			ran.push(symbolId);
			if (symbolId === 'symbol:row') rowItems.push(context.locals?.row);
		},
	});
	return {
		runtime,
		root,
		list,
		rows,
		ran,
		rowItems,
		buttonOf: (index: number) => rows[index]!.childNodes[0]!,
		write: async (value: ReadonlyArray<Item>) => {
			graph.write({ graphNodeId: 'state:rows', value });
			await graph.flush();
		},
	};
}

test('a click still holding a removed row reaches the record above the repeat', async () => {
	const { runtime, ran, buttonOf, write, list } = fixture();
	await runtime.start();
	const held = buttonOf(1);

	await write([{ id: 'a' }]);
	expect(list.childNodes.length).toBe(1);

	await expect(runtime.dispatch(click(held) as never)).resolves.toBeUndefined();
	expect(ran).toEqual(['symbol:page']);
});

test('the removed row keeps its own record from running once its key is gone', async () => {
	const { runtime, ran, rowItems, buttonOf, write } = fixture();
	await runtime.start();
	const held = buttonOf(1);

	// Live first: the row's own record answers, then the page's.
	await runtime.dispatch(click(held) as never);
	expect(ran).toEqual(['symbol:row', 'symbol:page']);
	expect(rowItems).toEqual([{ id: 'b' }]);

	await write([{ id: 'a' }]);
	ran.length = 0;
	await runtime.dispatch(click(held) as never);
	expect(ran).toEqual(['symbol:page']);
});

test('a row that leaves and comes back answers with its own record again', async () => {
	const { runtime, ran, rowItems, buttonOf, write } = fixture();
	await runtime.start();
	const held = buttonOf(1);

	await write([{ id: 'a' }]);
	await write([{ id: 'a' }, { id: 'b' }]);
	ran.length = 0;

	await runtime.dispatch(click(held) as never);
	expect(ran).toEqual(['symbol:row', 'symbol:page']);
	expect(rowItems).toEqual([{ id: 'b' }]);
});

test('a target nothing removed is still an unmatched dispatch', async () => {
	const { runtime, root, rows } = fixture();
	await runtime.start();

	// Detached by hand rather than by the repeat: the runtime knows nothing about
	// where it hung, so the walk has no path to finish and this stays a defect.
	const stray = rows[0]!;
	(root.childNodes[0] as Node).removeChild!(stray);

	await expect(
		runtime.dispatch(click(stray.childNodes[0]!) as never),
	).rejects.toMatchObject({ code: 'MARKLESS_EVENT_DISPATCH_UNMATCHED' });
});
