import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { wireKeyedRepeats } from '../../src/resume-keyed-repeats.ts';
import type { ResumeDomElement, ResumeViewRecord } from '../../src/resume-types.ts';

/**
 * Keyed rows are minted by the WRITE, not by the flush behind it.
 *
 * A handler that replaces a collection reads the rows back off a plural
 * `element()` handle on its next statement, and that read walks the repeat
 * parent's live children. So every assertion here reads the DOM straight after
 * `graph.write` and before `graph.flush`: awaiting the flush first would pass on
 * the old flush-time mint and pin nothing.
 */

type Node = {
	nodeType: number;
	tagName?: string;
	data?: string;
	childNodes: Node[];
	parentElement?: Node | null;
	insertBefore?: (node: Node, before: Node | null) => unknown;
	removeChild?: (node: Node) => unknown;
	replaceWith?: (node: Node) => void;
	ownerDocument?: unknown;
};

function adopt(node: Node, children: Node[]): Node {
	node.childNodes = children;
	for (const child of children) child.parentElement = node;
	node.replaceWith = (fresh) => {
		const parent = node.parentElement;
		if (!parent) return;
		const at = parent.childNodes.indexOf(node);
		if (at >= 0) parent.childNodes.splice(at, 1, fresh);
		fresh.parentElement = parent;
	};
	return node;
}

function el(tagName: string, children: Node[] = []): Node {
	const node: Node = { nodeType: 1, tagName, childNodes: [] };
	adopt(node, children);
	node.insertBefore = (fresh, before) => {
		const held = node.childNodes.indexOf(fresh);
		if (held >= 0) node.childNodes.splice(held, 1);
		const at = before ? node.childNodes.indexOf(before) : -1;
		if (at >= 0) node.childNodes.splice(at, 0, fresh);
		else node.childNodes.push(fresh);
		fresh.parentElement = node;
		return fresh;
	};
	node.removeChild = (gone) => {
		const at = node.childNodes.indexOf(gone);
		if (at >= 0) node.childNodes.splice(at, 1);
		gone.parentElement = null;
		return gone;
	};
	return node;
}

function txt(data: string): Node {
	return adopt({ nodeType: 3, data, childNodes: [] }, []);
}
function slot(): Node {
	return adopt({ nodeType: 8, data: 'markless-slot:0', childNodes: [] }, []);
}
function textOf(node: Node): string {
	return node.nodeType === 3 ? (node.data ?? '') : node.childNodes.map(textOf).join('');
}

const ROW_HTML = '<li data-row><b><!--markless-slot:0--></b></li>';
const ROW_TEMPLATE = { html: ROW_HTML, textSlots: [{ path: [0, 0, 0], itemPath: ['label'] }] };

function documentHost(builds: { count: number }) {
	return {
		createElement: () => {
			let content: { childNodes: Node[] } = { childNodes: [] };
			return {
				set innerHTML(html: string) {
					builds.count++;
					content = { childNodes: html === ROW_HTML ? [el('LI', [el('B', [slot()])])] : [] };
				},
				get content() {
					return content;
				},
			};
		},
		createTextNode: (data: string) => txt(data),
	};
}

type Item = { readonly id: string; readonly label: string };
const AUGUST: ReadonlyArray<Item> = [
	{ id: 'a', label: 'alpha' },
	{ id: 'b', label: 'bravo' },
];
const SEPTEMBER: ReadonlyArray<Item> = [
	{ id: 'x', label: 'xray' },
	{ id: 'y', label: 'yankee' },
];

/** `mint: false` stands in for a page whose row-mint loader was never emitted. */
function fixture(options: { readonly mint?: boolean; readonly derived?: boolean } = {}) {
	const rows = AUGUST.map((item) => el('LI', [el('B', [txt(item.label)])]));
	const list = el('UL', rows);
	const root = el('SECTION', [list]);
	const builds = { count: 0 };
	root.ownerDocument = documentHost(builds);
	list.ownerDocument = root.ownerDocument;
	(globalThis as { __marklessRowMint?: () => Promise<unknown> }).__marklessRowMint =
		options.mint === false ? undefined : () => import('../../src/fns/row-mint.ts');
	const collectionGraphNodeId = options.derived ? 'computed:rows' : 'state:rows';
	const view = {
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
		keyedRepeats: [
			{
				id: 'repeat:0',
				parentHostNodeId: 'h0',
				collectionGraphNodeId,
				collectionPath: [],
				keyPath: ['id'],
				itemName: 'row',
				rowElementCount: 2,
				rowTemplate: ROW_TEMPLATE,
				rowEvents: [],
			},
		],
	} as unknown as ResumeViewRecord;
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:rows', value: AUGUST }],
		computed: options.derived
			? [
					{
						graphNodeId: 'computed:rows',
						dependencies: [{ graphNodeId: 'state:rows' }],
						compute: (read) => read('state:rows'),
					},
				]
			: [],
	});
	const released: Array<() => void> = [];
	wireKeyedRepeats({
		graph,
		view,
		elementsByHostId: new Map<string, ResumeDomElement>([
			['h0', list as unknown as ResumeDomElement],
		]),
		events: { addRowEvent: () => undefined } as never,
		storeContainerSubscription: (release: () => void) => released.push(release),
	});
	return {
		graph,
		builds,
		released,
		labels: () => list.childNodes.map(textOf),
		write: (value: ReadonlyArray<Item>) => graph.write({ graphNodeId: 'state:rows', value }),
	};
}

test('a collection write has the new rows in the DOM before the next statement', async () => {
	const page = fixture();
	await page.graph.settleWriteObservers!();
	expect(page.labels()).toEqual(['alpha', 'bravo']);

	page.write(SEPTEMBER);

	expect(page.labels()).toEqual(['xray', 'yankee']);
});

test('the flush behind that write mints nothing a second time', async () => {
	const page = fixture();
	await page.graph.settleWriteObservers!();

	page.write(SEPTEMBER);
	const atWrite = page.builds.count;
	await page.graph.flush();

	expect(atWrite).toBe(2);
	expect(page.builds.count).toBe(atWrite);
	expect(page.labels()).toEqual(['xray', 'yankee']);
});

test('a key that left the collection is out of the document at the write', async () => {
	const page = fixture();
	await page.graph.settleWriteObservers!();

	page.write([AUGUST[0]!]);

	expect(page.labels()).toEqual(['alpha']);
});

test('a computed-backed collection is reached through the state write behind it', async () => {
	const page = fixture({ derived: true });
	await page.graph.settleWriteObservers!();
	expect(page.labels()).toEqual(['alpha', 'bravo']);

	page.write(SEPTEMBER);

	expect(page.labels()).toEqual(['xray', 'yankee']);
});

test('a page with no row-mint loader leaves the served rows alone', async () => {
	const page = fixture({ mint: false });
	await page.graph.settleWriteObservers?.();

	page.write(SEPTEMBER);
	expect(page.labels()).toEqual(['alpha', 'bravo']);

	await page.graph.flush();
	expect(page.labels()).toEqual(['alpha', 'bravo']);
});

test('a released repeat is told about no further write', async () => {
	const page = fixture();
	await page.graph.settleWriteObservers!();
	for (const release of page.released) release();

	page.write(SEPTEMBER);

	expect(page.labels()).toEqual(['alpha', 'bravo']);
});

test('an observer runs once per write and not from inside its own write', () => {
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:n', value: 0 }] });
	const seen: number[] = [];
	graph.subscribeWrite!({
		graphNodeId: 'state:n',
		run() {
			seen.push(graph.read('state:n') as number);
			if (seen.length < 3) graph.write({ graphNodeId: 'state:n', value: 99 });
		},
	});

	graph.write({ graphNodeId: 'state:n', value: 1 });

	expect(seen).toEqual([1]);
});

test('a write made during the flush notifies no observer', async () => {
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:n', value: 0 }] });
	let observed = 0;
	graph.subscribeWrite!({ graphNodeId: 'state:n', run: () => void observed++ });
	graph.subscribe({
		id: 'sub',
		graphNodeId: 'state:n',
		run(value) {
			if (value === 1) graph.write({ graphNodeId: 'state:n', value: 2 });
		},
	});

	graph.write({ graphNodeId: 'state:n', value: 1 });
	await graph.flush();

	expect(observed).toBe(1);
});
