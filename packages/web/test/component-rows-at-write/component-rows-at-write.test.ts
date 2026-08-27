import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { marklessRowComponentMint } from '../../src/fns/row-component-mint.ts';
import { wireKeyedRepeats } from '../../src/resume-keyed-repeats.ts';
import type { ResumeDomElement, ResumeViewRecord } from '../../src/resume-types.ts';

/**
 * Which repeats a page carrying a COMPONENT row may still place at the write.
 *
 * A component row's html comes from an async render, so a key with no row yet
 * cannot be built inside the handler's own statement. That refusal is asked of
 * the repeat and of the written collection, not of the loaded mint module: a
 * template repeat beside a component row builds from markup and waits for
 * nothing, and a collection that only reorders rows already built needs no mint
 * at all. Every assertion reads the DOM straight after `graph.write` and before
 * `graph.flush` - awaiting the flush first would pass on the flush-time apply.
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
	const node: Node = adopt({ nodeType: 1, tagName, childNodes: [] }, children);
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
const ROW_COMPONENT = { componentEdgeId: 'edge:0', componentName: 'Row', itemPropName: 'item' };

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
const ALPHA: Item = { id: 'a', label: 'alpha' };
const BRAVO: Item = { id: 'b', label: 'bravo' };
const XRAY: Item = { id: 'x', label: 'xray' };
const SERVED: ReadonlyArray<Item> = [ALPHA, BRAVO];

/**
 * A page whose row-mint loader is the component-row superset - the module that
 * carries `rows` - with the repeat spelled either way.
 */
function fixture(options: { readonly component?: boolean } = {}) {
	const rows = SERVED.map((item) => el('LI', [el('B', [txt(item.label)])]));
	const list = el('UL', rows);
	const root = el('SECTION', [list]);
	const builds = { count: 0 };
	root.ownerDocument = documentHost(builds);
	list.ownerDocument = root.ownerDocument;
	(globalThis as { __marklessRowMint?: () => Promise<unknown> }).__marklessRowMint = () =>
		Promise.resolve(marklessRowComponentMint(undefined));
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
				rowElementCount: 2,
				...(options.component
					? { rowComponent: ROW_COMPONENT }
					: { rowTemplate: ROW_TEMPLATE }),
				rowEvents: [],
			},
		],
	} as unknown as ResumeViewRecord;
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:rows', value: SERVED }] });
	wireKeyedRepeats({
		graph,
		view,
		elementsByHostId: new Map<string, ResumeDomElement>([
			['h0', list as unknown as ResumeDomElement],
		]),
		events: { addRowEvent: () => undefined } as never,
		storeContainerSubscription: () => undefined,
	});
	return {
		graph,
		builds,
		labels: () => list.childNodes.map(textOf),
		write: (value: ReadonlyArray<Item>) => graph.write({ graphNodeId: 'state:rows', value }),
	};
}

test('a template repeat on a page carrying a component row still mints at the write', async () => {
	const page = fixture();
	await page.graph.settleWriteObservers!();

	page.write([XRAY]);

	expect(page.labels()).toEqual(['xray']);
	expect(page.builds.count).toBe(1);
});

test('a component repeat reordering rows it already built is placed at the write', async () => {
	const page = fixture({ component: true });
	await page.graph.settleWriteObservers!();

	page.write([BRAVO, ALPHA]);

	expect(page.labels()).toEqual(['bravo', 'alpha']);
	expect(page.builds.count).toBe(0);
});

test('a component repeat dropping a row it already built is placed at the write', async () => {
	const page = fixture({ component: true });
	await page.graph.settleWriteObservers!();

	page.write([ALPHA]);

	expect(page.labels()).toEqual(['alpha']);
});

test('a key that left a component repeat can come back at the write', async () => {
	const page = fixture({ component: true });
	await page.graph.settleWriteObservers!();
	page.write([ALPHA]);
	await page.graph.flush();

	page.write([BRAVO, ALPHA]);

	expect(page.labels()).toEqual(['bravo', 'alpha']);
});

// Pins the fallback the synchronous render path has to turn: a component row's
// html comes from an async render, so a key with no row yet cannot be built
// inside the handler's own statement and the served rows stand until the flush.
test('a component repeat needing a row it has never built leaves the write alone', async () => {
	const page = fixture({ component: true });
	await page.graph.settleWriteObservers!();

	page.write([XRAY, ALPHA]);

	expect(page.labels()).toEqual(['alpha', 'bravo']);
});
