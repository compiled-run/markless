import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { wireKeyedRepeats } from '../src/resume-keyed-repeats.ts';
import type { ResumeDomElement, ResumeViewRecord } from '../src/resume-types.ts';

/**
 * Where a record naming a row COMPONENT goes at the refusal point.
 *
 * The bridge that renders such a row reaches the page's render-data surface, so
 * it is loaded through the global the app's own resume module writes, exactly as
 * the template mint is. Standing in for that emit is the loader below; what this
 * file pins is the repeat runtime's half - that an unserved key routes to the
 * bridge, that the row lands in its own span and in the pinned census, that its
 * registration runs after it is attached, and that a page handed no bridge does
 * exactly what it did before component rows existed.
 */

type Node = {
	nodeType: number;
	tagName?: string;
	data?: string;
	childNodes: Node[];
	parentElement?: Node | null;
	insertBefore?: (node: Node, before: Node | null) => unknown;
	removeChild?: (node: Node) => unknown;
	__marklessCensus?: Node[];
};

function el(tagName: string, children: Node[] = []): Node {
	const node: Node = { nodeType: 1, tagName, childNodes: [] };
	node.childNodes = children;
	for (const child of children) child.parentElement = node;
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
	return { nodeType: 3, data, childNodes: [] };
}

function textOf(node: Node): string {
	return node.nodeType === 3 ? (node.data ?? '') : node.childNodes.map(textOf).join('');
}

function elementsUnder(node: Node): Node[] {
	return [
		...(node.nodeType === 1 ? [node] : []),
		...node.childNodes.flatMap((child) => elementsUnder(child)),
	];
}

function componentRow(label: string): Node {
	return el('LI', [el('SPAN', [txt(label)]), el('BUTTON')]);
}

type MintCall = { readonly rowKey: unknown; readonly item: unknown };

// The bridge, standing in for `@markless/web/fns/row-component-mint` bound to a
// page's render-data surface: the same shape the emitted loader hands over. The
// repeat runtime joins one load per document, so this installs once and every
// fixture re-aims it - which is itself the production shape.
let bridge: { readonly mints: MintCall[]; readonly commits: unknown[] } = {
	mints: [],
	commits: [],
};
type BridgeHost = { readonly wired?: boolean } | undefined;
let wiredBridge = true;
(
	globalThis as {
		__marklessRowMint?: (graph?: unknown, host?: BridgeHost) => Promise<unknown>;
	}
).__marklessRowMint = async (graph, host) => {
	let prepared = new Map<unknown, Node>();
	return {
		mintRow(_parent: Node, _repeat: unknown, item: { readonly id: string }) {
			return prepared.get(item.id);
		},
		async rows(
			repeat: { readonly collectionGraphNodeId: string },
			_parent: Node,
			served: ReadonlyMap<unknown, Node>,
		) {
			prepared = new Map();
			// The repeat runtime joins one load per document, so the registrar this
			// double reads is the fixture's own, not the one the first load captured.
			void host;
			const items = wiredBridge
				? ((graph as { read: (id: string, path: never[]) => unknown }).read(
						repeat.collectionGraphNodeId,
						[],
					) as ReadonlyArray<{ readonly id: string; readonly label: string }>)
				: [];
			for (const item of items) {
				if (served.has(item.id) || prepared.has(item.id)) continue;
				bridge.mints.push({ rowKey: item.id, item });
				prepared.set(item.id, componentRow(item.label));
			}
			const minted = [...prepared];
			return async () => {
				prepared = new Map();
				for (const [rowKey, rowRoot] of minted)
					bridge.commits.push({ rowKey, attached: rowRoot.parentElement !== null });
			};
		},
	};
};

function fixture(options: { readonly wired?: boolean } = {}) {
	const served = [
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
	];
	const rows = served.map((item) => componentRow(item.label));
	const header = el('LI', [txt('header')]);
	const footer = el('LI', [txt('footer')]);
	const list = el('UL', [header, ...rows, footer]);
	const root = el('SECTION', [list]);
	root.__marklessCensus = elementsUnder(root);
	const mints: MintCall[] = [];
	const commits: unknown[] = [];
	bridge = { mints, commits };
	wiredBridge = options.wired !== false;
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
				collectionGraphNodeId: 'state:rows',
				collectionPath: [],
				keyPath: ['id'],
				itemName: 'row',
				rowElementCount: 3,
				rowStartOffset: 1,
				rowComponent: {
					componentEdgeId: 'edge:row',
					componentName: 'Page',
					itemPropName: 'item',
				},
				rowEvents: [{ hostPath: [1], eventName: 'click', symbolIds: ['symbol:row'] }],
			},
		],
	} as unknown as ResumeViewRecord;
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:rows', value: served }] });
	const registered: Array<{ readonly host: Node; readonly rowKey: unknown }> = [];
	wireKeyedRepeats(
		{
			graph,
			view,
			elementsByHostId: new Map<string, ResumeDomElement>([
				['h0', list as unknown as ResumeDomElement],
			]),
			events: {
				addRowEvent: (host: Node, match: { readonly rowKey: unknown }) =>
					registered.push({ host, rowKey: match.rowKey }),
			} as never,
			storeContainerSubscription: () => undefined,
		},
		options.wired === false ? undefined : ({ wired: true } as never),
	);
	return {
		graph,
		list,
		root,
		mints,
		commits,
		registered,
		footer,
		labels: () => list.childNodes.map(textOf),
		census: () => root.__marklessCensus!,
		write: async (value: ReadonlyArray<{ readonly id: string; readonly label: string }>) => {
			graph.write({ graphNodeId: 'state:rows', value });
			await graph.flush();
		},
	};
}

const GROWN = [
	{ id: 'a', label: 'alpha' },
	{ id: 'b', label: 'bravo' },
	{ id: 'c', label: 'charlie' },
];

test('an unserved key routes to the component bridge and lands in the row span', async () => {
	const { labels, write, list, footer, mints } = fixture();
	expect(labels()).toEqual(['header', 'alpha', 'bravo', 'footer']);

	await write(GROWN);

	expect(mints.map((mint) => mint.rowKey)).toEqual(['c']);
	expect(labels()).toEqual(['header', 'alpha', 'bravo', 'charlie', 'footer']);
	expect(list.childNodes.at(-1)).toBe(footer);
});

test('a minted component row enters the pinned census in document order', async () => {
	const { census, write, root } = fixture();
	const before = census().length;

	await write(GROWN);

	expect(census().length).toBe(before + 3);
	expect(census()).toEqual(elementsUnder(root));
});

// Registration is what makes the row's own events, handles and DOM updates live,
// and it can only resolve hosts once the row is where the page census counts it.
test('a minted component row registers after it is attached', async () => {
	const { write, commits } = fixture();

	await write(GROWN);

	expect(commits).toEqual([{ rowKey: 'c', attached: true }]);
});

test('a minted component row is wired for the same row events a served row is', async () => {
	const { registered, write, list } = fixture();
	expect(registered.map((entry) => entry.rowKey)).toEqual(['a', 'b']);

	await write(GROWN);

	const minted = list.childNodes[3]!;
	const last = registered.at(-1)!;
	expect(last.rowKey).toBe('c');
	expect(last.host).toBe(minted.childNodes[1]);
	expect(last.host.tagName).toBe('BUTTON');
});

// A key that leaves parks its row instead of releasing its wiring: releasing it
// would splice the graph's subscription list while the flush is walking it.
test('a component key that comes back reuses its parked row and never mints twice', async () => {
	const { write, mints, commits, list, labels } = fixture();

	await write(GROWN);
	const minted = list.childNodes[3]!;
	await write([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
	]);
	await write(GROWN);

	expect(mints.map((mint) => mint.rowKey)).toEqual(['c']);
	expect(commits).toHaveLength(1);
	expect(list.childNodes[3]).toBe(minted);
	expect(labels()).toEqual(['header', 'alpha', 'bravo', 'charlie', 'footer']);
});

// Pay-per-use, and fail-closed: a page whose resume module wrote no bridge has
// no surface to render a row against, so the list stays exactly as served.
test('a record naming a row component with no bridge wired leaves the key unrendered', async () => {
	const { write, labels, mints } = fixture({ wired: false });

	await write(GROWN);

	expect(mints).toEqual([]);
	expect(labels()).toEqual(['header', 'alpha', 'bravo', 'footer']);
});
