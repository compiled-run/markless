import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { wireKeyedRepeats } from '../src/resume-keyed-repeats.ts';
import type { ResumeDomElement, ResumeViewRecord } from '../src/resume-types.ts';

/**
 * The row a resumed client builds for a key the server never sent it.
 *
 * The record carries that row's markup and the item property behind each text
 * position; the mint renders it, fills the text, files the row so the same key
 * never builds a second one, and hands the row to the same event registration a
 * served row went through. What the browser witnesses cannot read is the pinned
 * element census, so these assertions read it directly: a row that entered the
 * document without saying so would shift the index of every element after it.
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
	__marklessCensus?: Node[];
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
		// A real insertBefore MOVES a node that is already a child; the reconcile
		// reorders rows by re-inserting them, so this double has to as well.
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

function elementsUnder(node: Node): Node[] {
	return [
		...(node.nodeType === 1 ? [node] : []),
		...node.childNodes.flatMap((child) => elementsUnder(child)),
	];
}

// The row shape every fixture here shares: a label position the mint fills from
// the item, and a button the row's `click` record points at.
const ROW_HTML = '<li data-row><b><!--markless-slot:0--></b><button></button></li>';
const ARM_HTML = '<li data-empty>nothing</li>';

function servedRow(label: string): Node {
	return el('LI', [el('B', [txt(label)]), el('BUTTON')]);
}

function mintedRow(): Node {
	return el('LI', [el('B', [slot()]), el('BUTTON')]);
}

/**
 * A document that answers each known markup string with fresh nodes. Parsing
 * markup is the browser's job and the browser witnesses cover it; what is under
 * test here is where the parsed nodes go, what they say, and what the census
 * then reads.
 */
function documentHost(builds: { count: number }) {
	return {
		createElement: () => {
			let content: { childNodes: Node[] } = { childNodes: [] };
			return {
				set innerHTML(html: string) {
					builds.count++;
					content = {
						childNodes:
							html === ROW_HTML ? [mintedRow()] : html === ARM_HTML ? [el('LI', [txt('nothing')])] : [],
					};
				},
				get content() {
					return content;
				},
			};
		},
		createTextNode: (data: string) => txt(data),
	};
}

const ROW_TEMPLATE = {
	html: ROW_HTML,
	textSlots: [{ path: [0, 0, 0], itemPath: ['label'] }],
};

function fixture(
	options: {
		readonly rowTemplate?: boolean;
		readonly emptyArm?: boolean;
		readonly served?: ReadonlyArray<{ readonly id: string; readonly label: string }>;
	} = {},
) {
	const served = options.served ?? [
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
	];
	const rows = served.map((item) => servedRow(item.label));
	const header = el('LI', [txt('header')]);
	const footer = el('LI', [txt('footer')]);
	const list = el('UL', [header, ...rows, footer]);
	const root = el('SECTION', [list]);
	const builds = { count: 0 };
	root.ownerDocument = documentHost(builds);
	list.ownerDocument = root.ownerDocument;
	// The pinned census in shipped order, exactly what materializeDomLocators
	// would have taken at boot.
	root.__marklessCensus = elementsUnder(root);
	const rowEvents = [{ hostPath: [1], eventName: 'click', symbolIds: ['symbol:row'] }];
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
				...(options.rowTemplate === false ? {} : { rowTemplate: ROW_TEMPLATE }),
				...(options.emptyArm ? { emptyArm: { html: ARM_HTML } } : {}),
				rowEvents,
			},
		],
	} as unknown as ResumeViewRecord;
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:rows', value: served }] });
	const registered: Array<{ readonly host: Node; readonly rowKey: unknown }> = [];
	wireKeyedRepeats({
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
	});
	return {
		graph,
		list,
		root,
		builds,
		registered,
		rows,
		footer,
		labels: () => list.childNodes.map(textOf),
		census: () => root.__marklessCensus!,
		write: async (value: ReadonlyArray<{ readonly id: string; readonly label: string }>) => {
			graph.write({ graphNodeId: 'state:rows', value });
			await graph.flush();
		},
	};
}

test('an unserved key gets a row built from the record, in the row span', async () => {
	const { labels, write, list, footer } = fixture();
	expect(labels()).toEqual(['header', 'alpha', 'bravo', 'footer']);

	await write([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
		{ id: 'c', label: 'charlie' },
	]);

	// Past the header, in front of the footer: the mint lands in the row span and
	// the text is this item's, not the template's marker.
	expect(labels()).toEqual(['header', 'alpha', 'bravo', 'charlie', 'footer']);
	expect(list.childNodes.at(-1)).toBe(footer);
});

test('a minted row enters the pinned census in document order', async () => {
	const { census, write, root } = fixture();
	const before = census().length;

	await write([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
		{ id: 'c', label: 'charlie' },
	]);

	// The row is three elements - LI, B, BUTTON - and the census reads exactly the
	// document it now describes.
	expect(census().length).toBe(before + 3);
	expect(census()).toEqual(elementsUnder(root));
});

test('a minted row is wired for the same row events a served row is', async () => {
	const { registered, write, list } = fixture();
	expect(registered.map((entry) => entry.rowKey)).toEqual(['a', 'b']);

	await write([
		{ id: 'a', label: 'alpha' },
		{ id: 'c', label: 'charlie' },
	]);

	const minted = list.childNodes[2]!;
	const last = registered.at(-1)!;
	expect(last.rowKey).toBe('c');
	// hostPath [1] on the row root: the button inside the row that was just built.
	expect(last.host).toBe(minted.childNodes[1]);
	expect(last.host.tagName).toBe('BUTTON');
});

test('a served key is never minted, however the collection is rewritten', async () => {
	const { builds, rows, write, list } = fixture();

	// Fresh item objects for the same keys: identity of the ITEM moved, identity
	// of the row must not.
	await write([
		{ id: 'b', label: 'bravo' },
		{ id: 'a', label: 'alpha' },
	]);

	expect(builds.count).toBe(0);
	expect(list.childNodes[1]).toBe(rows[1]);
	expect(list.childNodes[2]).toBe(rows[0]);
});

test('a minted key that leaves detaches and gives the census back', async () => {
	const { census, write, labels, root } = fixture();
	const before = census().length;

	await write([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
		{ id: 'c', label: 'charlie' },
	]);
	await write([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
	]);

	expect(labels()).toEqual(['header', 'alpha', 'bravo', 'footer']);
	expect(census().length).toBe(before);
	expect(census()).toEqual(elementsUnder(root));
});

test('a minted key that comes back reuses its own row instead of building a second', async () => {
	const { builds, write, list, labels } = fixture();
	const grown = [
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
		{ id: 'c', label: 'charlie' },
	];

	await write(grown);
	const minted = list.childNodes[3]!;
	await write([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
	]);
	await write(grown);

	expect(builds.count).toBe(1);
	expect(list.childNodes[3]).toBe(minted);
	expect(labels()).toEqual(['header', 'alpha', 'bravo', 'charlie', 'footer']);
});

// Pay-per-use, and fail-closed: the compiler ships `rowTemplate` only for a row
// the client can finish alone. Without it the reconcile does exactly what it did
// before minting existed.
test('a record with no row markup leaves an unserved key unrendered', async () => {
	const { builds, write, labels } = fixture({ rowTemplate: false });

	await write([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
		{ id: 'c', label: 'charlie' },
	]);

	expect(builds.count).toBe(0);
	expect(labels()).toEqual(['header', 'alpha', 'bravo', 'footer']);
});

test('a row this host cannot build refuses loudly instead of half-minting one', async () => {
	const { graph, root, list } = fixture();
	root.ownerDocument = undefined;
	list.ownerDocument = undefined;

	graph.write({
		graphNodeId: 'state:rows',
		value: [
			{ id: 'a', label: 'alpha' },
			{ id: 'b', label: 'bravo' },
			{ id: 'c', label: 'charlie' },
		],
	});
	await expect(graph.flush()).rejects.toThrowError(
		expect.objectContaining({ code: 'MARKLESS_REPEAT_ROW_MINT_RENDERER_MISSING' }),
	);
});

test('a list emptied after boot takes its @empty arm back out when a row is minted', async () => {
	const { write, labels, census, root } = fixture({ emptyArm: true });

	await write([]);
	expect(labels()).toEqual(['header', 'nothing', 'footer']);

	await write([{ id: 'c', label: 'charlie' }]);

	expect(labels()).toEqual(['header', 'charlie', 'footer']);
	expect(census()).toEqual(elementsUnder(root));
});

// The one shape the mint declines: the SERVER painted the arm, so this runtime
// holds no handle on those nodes and cannot take them out. Standing rows behind
// a live "nothing matches" would be worse than the list staying as served.
test('a page served empty with an @empty arm declines to mint', async () => {
	const { builds, write, labels } = fixture({ emptyArm: true, served: [] });

	await write([{ id: 'c', label: 'charlie' }]);

	expect(builds.count).toBe(0);
	expect(labels()).toEqual(['header', 'footer']);
});

// The same page WITHOUT an arm has nothing to take out, so growth is ordinary.
test('a page served empty with no @empty arm mints its first row', async () => {
	const { write, labels } = fixture({ served: [] });

	await write([{ id: 'c', label: 'charlie' }]);

	expect(labels()).toEqual(['header', 'charlie', 'footer']);
});
