import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { wireKeyedRepeats } from '../src/resume-keyed-repeats.ts';
import type {
	ResumeDomElement,
	ResumeDomNode,
	ResumeViewRecord,
} from '../src/resume-types.ts';

/**
 * The `@empty` arm the client raises, and what it owes the element census.
 *
 * A repeat leaves no anchor comment behind, so the arm lands by position in the
 * row span. That is a framework range mutation like any other: the pinned census
 * is the shipped shape as the framework has moved it, so an arm that entered the
 * document without saying so would shift the index of every element after this
 * repeat. These assertions read the census directly, which the browser witnesses
 * in vitest-browser cannot do.
 *
 * Raising the arm is node-building, so it comes from the same handed-in module a
 * minted row does; the line below stands in for the loader a compiled app emits.
 */
(globalThis as { __marklessRowMint?: () => Promise<unknown> }).__marklessRowMint = () =>
	import('../src/fns/row-mint.ts');

type Node = {
	nodeType: number;
	tagName?: string;
	childNodes: Node[];
	parentElement?: Node | null;
	textContent?: string;
	insertBefore?: (node: Node, before: Node | null) => unknown;
	removeChild?: (node: Node) => unknown;
	ownerDocument?: unknown;
	__marklessCensus?: Node[];
};

function el(tagName: string, children: Node[] = [], textContent = ''): Node {
	const node: Node = { nodeType: 1, tagName, childNodes: children, textContent };
	for (const child of children) child.parentElement = node;
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

// A template whose innerHTML answers exactly the one arm this fixture ships.
// Parsing markup is the browser's job and the browser witnesses cover it; what
// is under test here is where the parsed nodes go and what the census then says.
function documentHost(armHtml: string, build: () => Node[]) {
	return {
		createElement: () => {
			let content: { childNodes: Node[] } = { childNodes: [] };
			return {
				set innerHTML(html: string) {
					content = { childNodes: html === armHtml ? build() : [] };
				},
				get content() {
					return content;
				},
			};
		},
	};
}

const ARM_HTML = '<li data-empty>nothing</li>';

function fixture(options: { readonly emptyArm?: boolean } = {}) {
	const rowA = el('LI', [], 'alpha');
	const rowB = el('LI', [], 'bravo');
	const header = el('LI', [], 'header');
	const list = el('UL', [header, rowA, rowB]);
	const tail = el('P', [], 'tail');
	const root = el('SECTION', [list, tail]);
	const armNodes = [el('LI', [], 'nothing')];
	root.ownerDocument = documentHost(ARM_HTML, () => armNodes);
	list.ownerDocument = root.ownerDocument;
	// The pinned census in shipped order, exactly what materializeDomLocators
	// would have taken at boot.
	root.__marklessCensus = [root, list, header, rowA, rowB, tail];
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
				rowElementCount: 1,
				rowStartOffset: 1,
				...(options.emptyArm === false ? {} : { emptyArm: { html: ARM_HTML } }),
				rowEvents: [],
			},
		],
	} as unknown as ResumeViewRecord;
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:rows', value: [{ id: 'a' }, { id: 'b' }] }],
	});
	wireKeyedRepeats({
		graph,
		view,
		elementsByHostId: new Map<string, ResumeDomElement>([
			['h0', list as unknown as ResumeDomElement],
		]),
		events: { addRowEvent: () => undefined } as never,
		storeContainerSubscription: () => undefined,
	});
	const tags = () => list.childNodes.map((child) => child.textContent);
	const census = () => root.__marklessCensus!.map((node) => node.textContent);
	return { graph, list, root, armNodes, tags, census, rowA, rowB };
}

test('a list that empties after boot raises its @empty arm in the row span', async () => {
	const { graph, tags, census } = fixture();
	expect(tags()).toEqual(['header', 'alpha', 'bravo']);

	graph.write({ graphNodeId: 'state:rows', value: [] });
	await graph.flush();

	expect(tags()).toEqual(['header', 'nothing']);
	// The tail keeps its place behind the arm: the census was told about both the
	// two rows that left and the one node that arrived.
	expect(census()).toEqual(['', '', 'header', 'nothing', 'tail']);
});

test('a row coming back takes the arm out and puts the served rows in order', async () => {
	const { graph, tags, census } = fixture();
	graph.write({ graphNodeId: 'state:rows', value: [] });
	await graph.flush();
	expect(tags()).toEqual(['header', 'nothing']);

	graph.write({ graphNodeId: 'state:rows', value: [{ id: 'a' }, { id: 'b' }] });
	await graph.flush();

	expect(tags()).toEqual(['header', 'alpha', 'bravo']);
	expect(census()).toEqual(['', '', 'header', 'alpha', 'bravo', 'tail']);
});

test('a repeat with no @empty arm empties to nothing at all', async () => {
	const { graph, tags, census } = fixture({ emptyArm: false });

	graph.write({ graphNodeId: 'state:rows', value: [] });
	await graph.flush();

	expect(tags()).toEqual(['header']);
	expect(census()).toEqual(['', '', 'header', 'tail']);
});

test('the arm stays away while a row is still standing', async () => {
	const { graph, tags } = fixture();

	graph.write({ graphNodeId: 'state:rows', value: [{ id: 'b' }] });
	await graph.flush();

	expect(tags()).toEqual(['header', 'bravo']);
});

test('an arm this host cannot build refuses loudly instead of half-raising one', async () => {
	const { graph, root, list } = fixture();
	root.ownerDocument = undefined;
	list.ownerDocument = undefined;

	graph.write({ graphNodeId: 'state:rows', value: [] });
	await expect(graph.flush()).rejects.toThrowError(
		expect.objectContaining({ code: 'MARKLESS_REPEAT_EMPTY_ARM_RENDERER_MISSING' }),
	);
});

// Guard against a second arm being stacked on the server's own: a page served
// with an empty collection already shows the arm, and this runtime did not make
// those nodes.
test('a page served empty is left exactly as the server painted it', async () => {
	const served = el('LI', [], 'nothing');
	const header = el('LI', [], 'header');
	const list = el('UL', [header, served]);
	const root = el('SECTION', [list]);
	root.ownerDocument = documentHost(ARM_HTML, () => [el('LI', [], 'nothing')]);
	list.ownerDocument = root.ownerDocument;
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
				rowElementCount: 1,
				rowStartOffset: 1,
				emptyArm: { html: ARM_HTML },
				rowEvents: [],
			},
		],
	} as unknown as ResumeViewRecord;
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:rows', value: [] }] });
	wireKeyedRepeats({
		graph,
		view,
		elementsByHostId: new Map<string, ResumeDomElement>([
			['h0', list as unknown as ResumeDomElement],
		]),
		events: { addRowEvent: () => undefined } as never,
		storeContainerSubscription: () => undefined,
	});

	graph.write({ graphNodeId: 'state:rows', value: [] });
	await graph.flush();

	expect(list.childNodes.map((child: ResumeDomNode & { textContent?: string }) => child.textContent)).toEqual([
		'header',
		'nothing',
	]);
});
