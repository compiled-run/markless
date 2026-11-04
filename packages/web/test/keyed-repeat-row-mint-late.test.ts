import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { wireKeyedRepeats } from '../src/resume-keyed-repeats.ts';
import type { ResumeDomElement, ResumeViewRecord } from '../src/resume-types.ts';

// Own file: the row mint loader is a page global, and these tests hold it until they release it.
const rowMint = await import('../src/fns/row-mint.ts');
let release: () => void = () => undefined;
let arrived = Promise.resolve();
(globalThis as { __marklessRowMint?: () => Promise<unknown> }).__marklessRowMint = () => {
	arrived = new Promise<void>((resolve) => (release = resolve));
	return arrived.then(() => rowMint);
};

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

function replaceable(node: Node): Node {
	node.replaceWith = (fresh) => {
		const parent = node.parentElement;
		if (!parent) return;
		parent.childNodes.splice(parent.childNodes.indexOf(node), 1, fresh);
		fresh.parentElement = parent;
	};
	return node;
}

const ROW_HTML = '<li><b><!--markless-slot:0--></b></li>';

function el(tagName: string, children: Node[] = []): Node {
	const node: Node = { nodeType: 1, tagName, childNodes: children };
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
	return replaceable({ nodeType: 3, data, childNodes: [] });
}

function textOf(node: Node): string {
	return node.nodeType === 3 ? (node.data ?? '') : node.childNodes.map(textOf).join('');
}

const documentHost = {
	createElement: () => {
		let content: { childNodes: Node[] } = { childNodes: [] };
		return {
			set innerHTML(html: string) {
				const slot = replaceable({ nodeType: 8, data: 'markless-slot:0', childNodes: [] });
				content = { childNodes: html === ROW_HTML ? [el('LI', [el('B', [slot])])] : [] };
			},
			get content() {
				return content;
			},
		};
	},
	createTextNode: (data: string) => txt(data),
};

function servedList(labels: readonly string[], painted = labels.length) {
	const rows = labels.slice(0, painted).map((label) => el('LI', [el('B', [txt(label)])]));
	const list = el('UL', rows);
	list.ownerDocument = documentHost;
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:rows', value: labels.map((label) => ({ id: label, label })) },
		],
	});
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
				rowTemplate: {
					html: ROW_HTML,
					textSlots: [{ path: [0, 0, 0], itemPath: ['label'] }],
				},
				rowEvents: [],
			},
		],
	} as unknown as ResumeViewRecord;
	wireKeyedRepeats({
		graph,
		view,
		elementsByHostId: new Map<string, ResumeDomElement>([
			['h0', list as unknown as ResumeDomElement],
		]),
		events: { addRowEvent: () => undefined } as never,
		storeContainerSubscription: () => undefined,
	});
	return { graph, list, rows, labels: () => list.childNodes.map(textOf) };
}

async function rowCodeArrives() {
	release();
	await arrived;
	await new Promise((resolve) => setTimeout(resolve, 0));
}

test('a row the browser removed before the row code arrived stays removed when nothing wrote the list', async () => {
	const { list, rows, labels } = servedList(['alpha', 'bravo', 'charlie']);

	// What a contenteditable does on Backspace against an island: the browser takes the row out itself.
	list.removeChild!(rows[1]!);
	await rowCodeArrives();

	expect(labels()).toEqual(['alpha', 'charlie']);
});

test('a write made while the row code was loading still lands when it arrives', async () => {
	const { graph, labels } = servedList(['alpha', 'bravo']);

	graph.write({
		graphNodeId: 'state:rows',
		value: [
			{ id: 'alpha', label: 'alpha' },
			{ id: 'bravo', label: 'bravo' },
			{ id: 'delta', label: 'delta' },
		],
	});
	const flushed = graph.flush();
	await rowCodeArrives();
	await flushed;

	expect(labels()).toEqual(['alpha', 'bravo', 'delta']);
});

test('a page served with fewer rows than its list gets the rest when the row code arrives', async () => {
	const { labels } = servedList(['alpha', 'bravo'], 1);
	expect(labels()).toEqual(['alpha']);

	await rowCodeArrives();

	expect(labels()).toEqual(['alpha', 'bravo']);
});
