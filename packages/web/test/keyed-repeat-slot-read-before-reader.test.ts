import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { wireKeyedRepeats } from '../src/resume-keyed-repeats.ts';
import type { ResumeDomElement, ResumeViewRecord } from '../src/resume-types.ts';

// Own file: the row mint loader is a page global. A row slot reading page state is compared with what the server painted, not with the state at the moment the row code arrives.
const rowMint = await import('../src/fns/row-mint.ts');
let release: () => void = () => undefined;
let arrived = Promise.resolve();
const marked = (point: unknown, id: string) =>
	point instanceof Map
		? point.get('at') === id
		: point instanceof Set
			? point.has(id)
			: String(point) === id;
type Graph = { read(id: string, path?: ReadonlyArray<string>): unknown };
(globalThis as { __marklessRowMint?: () => Promise<unknown> }).__marklessRowMint = () => {
	arrived = new Promise<void>((resolve) => (release = resolve));
	return arrived.then(() => ({
		...rowMint,
		slotReader: (_repeat: unknown, graph: Graph) => (_source: string, item: { id: string }) =>
			'row s' +
			(graph.read('state:status') as string)[Number(item.id)] +
			(marked(graph.read('state:point'), item.id) ? ' blocking' : ''),
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

function servedRows(status: unknown = '000', point: unknown = '-1') {
	const rows = ['0', '1', '2'].map(() => el('LI', [], { class: 'row s0' }));
	const list = el('UL', rows);
	list.ownerDocument = documentHost;
	for (const row of rows) row.ownerDocument = documentHost;
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:status', value: status },
			{ graphNodeId: 'state:point', value: point },
			{ graphNodeId: 'computed:rows', value: [{ id: '0' }, { id: '1' }, { id: '2' }] },
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
				collectionGraphNodeId: 'computed:rows',
				collectionPath: [],
				keyPath: ['id'],
				itemName: 'row',
				rowElementCount: 1,
				rowTemplate: {
					html: '<li></li>',
					componentName: 'Rows',
					attributeSlots: [
						{
							path: [0],
							name: 'class',
							source: "'row s' + status[row.id] + (point === row.id ? ' blocking' : '')",
							reads: [
								{ graphNodeId: 'state:status', path: [] },
								{ graphNodeId: 'state:point', path: [] },
							],
						},
					],
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

test('a state write made while the row code was loading repaints the rows when it arrives', async () => {
	const { graph, classes } = servedRows();
	graph.write({ graphNodeId: 'state:point', value: '1' });
	const flushed = graph.flush();
	await rowCodeArrives();
	await flushed;
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(classes()).toEqual(['row s0', 'row s0 blocking', 'row s0']);
});

test('a write to the state the rows index by key repaints them too', async () => {
	const { graph, classes } = servedRows();
	graph.write({ graphNodeId: 'state:status', value: '120' });
	const flushed = graph.flush();
	await rowCodeArrives();
	await flushed;
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(classes()).toEqual(['row s1', 'row s2', 'row s0']);
});

test('a write into an array the rows index by key, made in place, repaints them too', async () => {
	const { graph, classes } = servedRows(['0', '0', '0']);
	graph.write({ graphNodeId: 'state:status', path: ['1'], value: '2' });
	const flushed = graph.flush();
	await rowCodeArrives();
	await flushed;
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(classes()).toEqual(['row s0', 'row s2', 'row s0']);
});

test('a write to a Map, Set or BigInt the rows read repaints them too', async () => {
	for (const [served, written] of [
		[new Map([['at', '-1']]), new Map([['at', '1']])],
		[new Set(['-1']), new Set(['1'])],
		[-1n, 1n],
	] as const) {
		const { graph, classes } = servedRows('000', served);
		graph.write({ graphNodeId: 'state:point', value: written });
		const flushed = graph.flush();
		await rowCodeArrives();
		await flushed;
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(classes()).toEqual(['row s0', 'row s0 blocking', 'row s0']);
	}
});

test('rows with nothing written before the row code arrives are left as served', async () => {
	const { graph, classes } = servedRows();
	await rowCodeArrives();
	expect(classes()).toEqual(['row s0', 'row s0', 'row s0']);
	graph.write({ graphNodeId: 'state:point', value: '2' });
	await graph.flush();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(classes()).toEqual(['row s0', 'row s0', 'row s0 blocking']);
});
