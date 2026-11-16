import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { wireKeyedRepeats } from '../src/resume-keyed-repeats.ts';
import type { ResumeDomElement, ResumeViewRecord } from '../src/resume-types.ts';

// Own file: the row mint loader is a page global. A row attribute worked out from its item is compared with the item the server painted, even when a write changed that item in place before the row code arrived.
const rowMint = await import('../src/fns/row-mint.ts');
let release: () => void = () => undefined;
let arrived = Promise.resolve();
type Seat = { id: string; picked: boolean };
(globalThis as { __marklessRowMint?: () => Promise<unknown> }).__marklessRowMint = () => {
	arrived = new Promise<void>((resolve) => (release = resolve));
	return arrived.then(() => ({
		...rowMint,
		slotReader: () => (_source: string, item: Seat) => (item.picked ? 'picked' : 'free'),
	}));
};

type Node = {
	nodeType: number;
	tagName?: string;
	childNodes: Node[];
	attributes: Map<string, string>;
	parentElement?: Node | null;
	ownerDocument?: unknown;
	getAttribute(name: string): string | null;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
};

function el(tagName: string, children: Node[] = [], attributes: Record<string, string> = {}): Node {
	const node: Node = {
		nodeType: 1,
		tagName,
		childNodes: children,
		attributes: new Map(Object.entries(attributes)),
		getAttribute: (name) => node.attributes.get(name) ?? null,
		setAttribute: (name, value) => void node.attributes.set(name, value),
		removeAttribute: (name) => void node.attributes.delete(name),
	};
	for (const child of children) child.parentElement = node;
	return node;
}

const documentHost = {
	createElement: () => {
		let content: { childNodes: Node[] } = { childNodes: [] };
		return {
			set innerHTML(_html: string) {
				content = { childNodes: [el('LI')] };
			},
			get content() {
				return content;
			},
		};
	},
};

function servedSeats() {
	const rows = ['a', 'b', 'c'].map(() => el('LI', [], { class: 'free' }));
	const list = el('UL', rows);
	list.ownerDocument = documentHost;
	for (const row of rows) row.ownerDocument = documentHost;
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:seats',
				value: [
					{ id: 'a', picked: false },
					{ id: 'b', picked: false },
					{ id: 'c', picked: false },
				],
			},
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
				collectionGraphNodeId: 'state:seats',
				collectionPath: [],
				keyPath: ['id'],
				itemName: 'seat',
				rowElementCount: 1,
				rowTemplate: {
					html: '<li></li>',
					componentName: 'Seats',
					attributeSlots: [{ path: [0], name: 'class', source: "seat.picked ? 'picked' : 'free'" }],
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
	return { graph, classes: () => rows.map((row) => row.getAttribute('class')) };
}

async function rowCodeArrives() {
	release();
	await arrived;
	await new Promise((resolve) => setTimeout(resolve, 0));
}

test('a write into one item, made in place while the row code was loading, repaints its row when the code arrives', async () => {
	const { graph, classes } = servedSeats();
	graph.write({ graphNodeId: 'state:seats', path: ['1', 'picked'], value: true });
	const flushed = graph.flush();
	await rowCodeArrives();
	await flushed;
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(classes()).toEqual(['free', 'picked', 'free']);
	graph.write({ graphNodeId: 'state:seats', path: ['0', 'picked'], value: true });
	await graph.flush();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(classes()).toEqual(['picked', 'picked', 'free']);
});

test('rows whose items nothing wrote before the row code arrives are left as served', async () => {
	const { classes } = servedSeats();
	await rowCodeArrives();
	expect(classes()).toEqual(['free', 'free', 'free']);
});
